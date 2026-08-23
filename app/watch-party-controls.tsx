"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { playerServerIdForSource } from "../lib/player-servers";

type PartyProviderId = "cinesrc" | "moviesapi" | "vidzen";

type PartySource = {
  id: string;
  name: string;
  src: string;
};

type PartyMedia = {
  id: string;
  title: string;
  kind: "movie" | "tv";
  season?: number;
  episode?: number;
};

type PartyPlayback = {
  paused: boolean;
  currentTime: number;
  updatedAt: number;
  sequence: number;
};

type PartyParticipant = {
  id: string;
  name: string;
  host: boolean;
};

type PartyRole = "host" | "guest" | "";

const PARTY_PROVIDERS = new Set<PartyProviderId>(["cinesrc", "moviesapi", "vidzen"]);

function providerFor(source?: PartySource): PartyProviderId | null {
  if (!source) return null;
  const id = playerServerIdForSource(source.id) as PartyProviderId;
  return PARTY_PROVIDERS.has(id) ? id : null;
}

function normalizeRoomCode(value: string) {
  return value.toUpperCase().replace(/[^A-Z2-9]/g, "").slice(0, 6);
}

function sendPlayerCommand(
  iframe: HTMLIFrameElement | null,
  providerId: PartyProviderId,
  command: "play" | "pause" | "seek" | "getStatus",
  time?: number,
) {
  const target = iframe?.contentWindow;
  if (!target) return;
  if (providerId === "cinesrc") {
    target.postMessage({
      type: "cinesrc:command",
      command: command === "getStatus" ? "getCurrentTime" : command,
      args: command === "seek" ? [Math.max(0, Number(time) || 0)] : [],
    }, "https://cinesrc.st");
    if (command === "getStatus") {
      target.postMessage({ type: "cinesrc:command", command: "getPaused", args: [] }, "https://cinesrc.st");
    }
    return;
  }
  if (providerId === "moviesapi") {
    target.postMessage({ action: command, ...(command === "seek" ? { time: Math.max(0, Number(time) || 0) } : {}) }, "https://moviesapi.to");
    return;
  }
  target.postMessage(JSON.stringify({
    command,
    ...(command === "seek" ? { time: Math.max(0, Number(time) || 0) } : {}),
  }), "https://vidzen.fun");
}

function parsePlayerEvent(event: MessageEvent, providerId: PartyProviderId) {
  let payload: unknown = event.data;
  if (providerId === "vidzen" && typeof payload === "string") {
    try {
      payload = JSON.parse(payload);
    } catch {
      return null;
    }
  }
  if (!payload || typeof payload !== "object") return null;
  const data = payload as Record<string, unknown>;
  let eventName = "";
  let details: Record<string, unknown> = data;

  if (providerId === "cinesrc") {
    if (typeof data.type !== "string" || !data.type.startsWith("cinesrc:")) return null;
    eventName = data.type.slice("cinesrc:".length);
  } else if (providerId === "moviesapi") {
    if (data.source !== "moviesapi-player" || typeof data.event !== "string") return null;
    eventName = data.event;
  } else {
    if (data.type !== "PLAYER_EVENT") return null;
    details = data.data && typeof data.data === "object" ? data.data as Record<string, unknown> : data;
    eventName = typeof details.event === "string" ? details.event : "";
  }

  const currentTime = Number(details.currentTime ?? data.currentTime);
  const pausedValue = details.paused ?? data.paused;
  return {
    name: eventName.toLowerCase(),
    currentTime: Number.isFinite(currentTime) ? Math.max(0, currentTime) : null,
    paused: typeof pausedValue === "boolean" ? pausedValue : null,
    command: typeof data.command === "string" ? data.command : "",
    result: data.result,
  };
}

export default function WatchPartyControls({
  media,
  sources,
  activeSource,
  playerRef,
  onSelectSource,
  onOpenChange,
  onSessionProviderChange,
}: {
  media: PartyMedia;
  sources: PartySource[];
  activeSource?: PartySource;
  playerRef: RefObject<HTMLIFrameElement | null>;
  onSelectSource: (id: string) => void;
  onOpenChange?: (open: boolean) => void;
  onSessionProviderChange?: (providerId: PartyProviderId | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [roomCode, setRoomCode] = useState("");
  const [codeInput, setCodeInput] = useState("");
  const [role, setRole] = useState<PartyRole>("");
  const [participants, setParticipants] = useState<PartyParticipant[]>([]);
  const [providerId, setProviderId] = useState<PartyProviderId | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [unlocked, setUnlocked] = useState(true);

  const wsRef = useRef<WebSocket | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const clientIdRef = useRef("");
  const roleRef = useRef<PartyRole>("");
  const roomCodeRef = useRef("");
  const providerRef = useRef<PartyProviderId | null>(null);
  const currentTimeRef = useRef(0);
  const pausedRef = useRef(true);
  const unlockedRef = useRef(true);
  const pendingPlaybackRef = useRef<PartyPlayback | null>(null);
  const applyingRemoteUntilRef = useRef(0);
  const lastStateSentAtRef = useRef(0);
  const serverClockOffsetRef = useRef(0);
  const autoJoinAttemptedRef = useRef(false);
  const sourcesRef = useRef(sources);
  const mediaRef = useRef(media);
  const activeSourceRef = useRef(activeSource);

  const compatibleSources = useMemo(() => sources.filter((source) => providerFor(source)), [sources]);

  useEffect(() => { sourcesRef.current = sources; }, [sources]);
  useEffect(() => { mediaRef.current = media; }, [media]);
  useEffect(() => { activeSourceRef.current = activeSource; }, [activeSource]);
  useEffect(() => { unlockedRef.current = unlocked; }, [unlocked]);

  const updateOpen = useCallback((next: boolean) => {
    setOpen(next);
    onOpenChange?.(next);
  }, [onOpenChange]);

  const resetSession = useCallback((removeInvite = true) => {
    roomCodeRef.current = "";
    roleRef.current = "";
    providerRef.current = null;
    pendingPlaybackRef.current = null;
    setRoomCode("");
    setRole("");
    setParticipants([]);
    setProviderId(null);
    setUnlocked(true);
    unlockedRef.current = true;
    onSessionProviderChange?.(null);
    if (removeInvite && typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (url.searchParams.has("party")) {
        url.searchParams.delete("party");
        window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
      }
    }
  }, [onSessionProviderChange]);

  const applyPlayback = useCallback((playback: PartyPlayback, force = false) => {
    pendingPlaybackRef.current = playback;
    if (!providerRef.current || (!unlockedRef.current && roleRef.current === "guest")) return;
    const serverTimeNow = Date.now() + serverClockOffsetRef.current;
    const elapsed = playback.paused ? 0 : Math.max(0, (serverTimeNow - playback.updatedAt) / 1000);
    const targetTime = Math.max(0, playback.currentTime + elapsed);
    applyingRemoteUntilRef.current = Date.now() + 1800;
    if (force || Math.abs(currentTimeRef.current - targetTime) > 1.25) {
      sendPlayerCommand(playerRef.current, providerRef.current, "seek", targetTime);
      currentTimeRef.current = targetTime;
    }
    sendPlayerCommand(playerRef.current, providerRef.current, playback.paused ? "pause" : "play");
    pausedRef.current = playback.paused;
  }, [playerRef]);

  const selectProvider = useCallback((nextProvider: PartyProviderId, playback?: PartyPlayback) => {
    const source = sourcesRef.current.find((item) => providerFor(item) === nextProvider);
    if (!source) {
      setError(`O servidor ${nextProvider} não está disponível para este título.`);
      return false;
    }
    providerRef.current = nextProvider;
    setProviderId(nextProvider);
    onSessionProviderChange?.(nextProvider);
    if (activeSourceRef.current?.id !== source.id) onSelectSource(source.id);
    if (playback) {
      pendingPlaybackRef.current = playback;
      window.setTimeout(() => applyPlayback(playback, true), 900);
    }
    return true;
  }, [applyPlayback, onSelectSource, onSessionProviderChange]);

  const handleSocketMessage = useCallback((raw: string) => {
    let message: Record<string, unknown>;
    try {
      message = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return;
    }
    const type = String(message.type || "");
    const serverNow = Number(message.serverNow);
    if (Number.isFinite(serverNow)) serverClockOffsetRef.current = serverNow - Date.now();
    if (type === "connected") {
      clientIdRef.current = String(message.clientId || "");
      return;
    }
    if (type === "error") {
      setError(String(message.message || "Não foi possível entrar na sessão."));
      setConnecting(false);
      return;
    }
    if (type === "joined") {
      const joinedMedia = message.media as PartyMedia | undefined;
      const currentMedia = mediaRef.current;
      const sameEpisode = currentMedia.kind !== "tv" || (
        Number(joinedMedia?.season) === Number(currentMedia.season) &&
        Number(joinedMedia?.episode) === Number(currentMedia.episode)
      );
      if (!joinedMedia || joinedMedia.id !== currentMedia.id || joinedMedia.kind !== currentMedia.kind || !sameEpisode) {
        wsRef.current?.send(JSON.stringify({ type: "leave" }));
        setError(`Esta sala está assistindo outro ${joinedMedia?.kind === "tv" ? "episódio" : "filme"}. Abra o link completo do convite.`);
        setConnecting(false);
        return;
      }
      const nextRole = message.role === "host" ? "host" : "guest";
      const nextProvider = String(message.providerId || "") as PartyProviderId;
      const playback = message.playback as PartyPlayback;
      const code = String(message.roomCode || "");
      roomCodeRef.current = code;
      roleRef.current = nextRole;
      setRoomCode(code);
      setRole(nextRole);
      setParticipants(Array.isArray(message.participants) ? message.participants as PartyParticipant[] : []);
      setConnecting(false);
      setError("");
      const canControl = nextRole === "host";
      setUnlocked(canControl);
      unlockedRef.current = canControl;
      if (!selectProvider(nextProvider, playback)) return;
      const url = new URL(window.location.href);
      url.searchParams.set("party", code);
      window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
      return;
    }
    if (type === "participants") {
      const list = Array.isArray(message.participants) ? message.participants as PartyParticipant[] : [];
      setParticipants(list);
      const me = list.find((participant) => participant.id === clientIdRef.current);
      if (me) {
        const nextRole = me.host ? "host" : "guest";
        roleRef.current = nextRole;
        setRole(nextRole);
      }
      return;
    }
    if (type === "hostChanged") {
      const nextRole = String(message.hostClientId || "") === clientIdRef.current ? "host" : "guest";
      roleRef.current = nextRole;
      setRole(nextRole);
      if (nextRole === "host") {
        setUnlocked(true);
        unlockedRef.current = true;
        setError("Você agora controla a sessão.");
      }
      return;
    }
    if (type === "sync") {
      applyPlayback(message.playback as PartyPlayback, String(message.action || "") === "seek");
      return;
    }
    if (type === "provider") {
      selectProvider(String(message.providerId || "") as PartyProviderId, message.playback as PartyPlayback);
      setError("O anfitrião trocou o servidor para todos.");
      return;
    }
    if (type === "roomClosed") {
      setError("O anfitrião encerrou a sessão.");
      wsRef.current?.close();
      resetSession();
      return;
    }
    if (type === "left") resetSession();
  }, [applyPlayback, resetSession, selectProvider]);

  const connect = useCallback(async (mode: "create" | "join", requestedCode = "") => {
    if (connecting) return;
    const candidate = mode === "create"
      ? sourcesRef.current.find((source) => providerFor(source))
      : null;
    if (mode === "create" && !candidate) {
      setError("Nenhum player compatível com sessão compartilhada está disponível para este título.");
      updateOpen(true);
      return;
    }
    const code = normalizeRoomCode(requestedCode);
    if (mode === "join" && code.length !== 6) {
      setError("Digite o código de 6 caracteres da sala.");
      updateOpen(true);
      return;
    }
    setConnecting(true);
    setError("");
    updateOpen(true);
    try {
      const response = await fetch("/api/watch-party/ticket", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
      });
      const data = await response.json() as { ticket?: string; erro?: string };
      if (!response.ok || !data.ticket) throw new Error(data.erro || "Não foi possível autenticar a sessão.");
      wsRef.current?.close();
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      // O prefixo `vite-` faz o adaptador local ignorar este canal próprio,
      // enquanto o servidor WebSocket do Flixa continua negociando o protocolo.
      const socket = new WebSocket(
        `${protocol}//${window.location.host}/api/watch-party/socket?ticket=${encodeURIComponent(data.ticket)}`,
        "vite-watch-party",
      );
      wsRef.current = socket;
      socket.addEventListener("open", () => {
        if (mode === "create" && candidate) {
          const nextProvider = providerFor(candidate);
          if (!nextProvider) return;
          onSelectSource(candidate.id);
          socket.send(JSON.stringify({ type: "create", providerId: nextProvider, media: mediaRef.current }));
        } else {
          socket.send(JSON.stringify({ type: "join", roomCode: code }));
        }
      });
      socket.addEventListener("message", (event) => handleSocketMessage(String(event.data)));
      socket.addEventListener("error", () => {
        setError("A conexão em tempo real falhou. Confira se o servidor aceita WebSocket.");
        setConnecting(false);
      });
      socket.addEventListener("close", (event) => {
        if (wsRef.current !== socket) return;
        setConnecting(false);
        if (roomCodeRef.current) {
          const detail = event.code === 1006
            ? "O canal em tempo real foi interrompido sem resposta do servidor."
            : `O canal em tempo real foi encerrado (código ${event.code}).`;
          setError(detail);
          resetSession(false);
        }
      });
    } catch (cause) {
      setConnecting(false);
      setError(cause instanceof Error ? cause.message : "Não foi possível abrir a sessão.");
    }
  }, [connecting, handleSocketMessage, onSelectSource, resetSession, updateOpen]);

  useEffect(() => {
    if (autoJoinAttemptedRef.current || compatibleSources.length === 0) return;
    const partyValue = new URL(window.location.href).searchParams.get("party") || "";
    if (partyValue.toLowerCase() === "create") {
      autoJoinAttemptedRef.current = true;
      queueMicrotask(() => void connect("create"));
      return;
    }
    const inviteCode = normalizeRoomCode(partyValue);
    if (inviteCode.length !== 6) return;
    autoJoinAttemptedRef.current = true;
    queueMicrotask(() => void connect("join", inviteCode));
  }, [compatibleSources.length, connect]);

  useEffect(() => {
    if (!open) return;
    const closeOnOutside = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) updateOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") updateOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutside);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutside);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open, updateOpen]);

  useEffect(() => {
    const nextProvider = providerFor(activeSource);
    if (!nextProvider || nextProvider !== providerRef.current || !roomCodeRef.current) return;
    const timer = window.setTimeout(() => {
      sendPlayerCommand(playerRef.current, nextProvider, "getStatus");
      if (pendingPlaybackRef.current) applyPlayback(pendingPlaybackRef.current, true);
    }, 850);
    return () => window.clearTimeout(timer);
  }, [activeSource, applyPlayback, playerRef]);

  useEffect(() => {
    const onPlayerMessage = (event: MessageEvent) => {
      const currentProvider = providerRef.current;
      const iframe = playerRef.current;
      if (!currentProvider || !iframe?.contentWindow || event.source !== iframe.contentWindow) return;
      const expectedOrigin = currentProvider === "cinesrc"
        ? "https://cinesrc.st"
        : currentProvider === "moviesapi"
          ? "https://moviesapi.to"
          : "https://vidzen.fun";
      if (event.origin !== expectedOrigin) return;
      const playerEvent = parsePlayerEvent(event, currentProvider);
      if (!playerEvent) return;

      if (playerEvent.name === "response") {
        if (playerEvent.command === "getCurrentTime" && Number.isFinite(Number(playerEvent.result))) {
          currentTimeRef.current = Math.max(0, Number(playerEvent.result));
        }
        if (playerEvent.command === "getPaused" && typeof playerEvent.result === "boolean") {
          pausedRef.current = playerEvent.result;
        }
        return;
      }
      if (playerEvent.currentTime != null) currentTimeRef.current = playerEvent.currentTime;
      if (playerEvent.paused != null) pausedRef.current = playerEvent.paused;
      if (playerEvent.name === "play") pausedRef.current = false;
      if (playerEvent.name === "pause" || playerEvent.name === "ended") pausedRef.current = true;
      if (playerEvent.name === "ready" && pendingPlaybackRef.current) {
        applyPlayback(pendingPlaybackRef.current, true);
      }

      if (roleRef.current !== "host" || !roomCodeRef.current || Date.now() < applyingRemoteUntilRef.current) return;
      const socket = wsRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN) return;
      const emitSync = (action: "play" | "pause" | "seek" | "state") => {
        socket.send(JSON.stringify({
          type: "sync",
          action,
          currentTime: currentTimeRef.current,
          paused: pausedRef.current,
        }));
      };
      if (playerEvent.name === "play") emitSync("play");
      else if (playerEvent.name === "pause" || playerEvent.name === "ended") emitSync("pause");
      else if (playerEvent.name === "seeked") emitSync("seek");
      else if (playerEvent.name === "timeupdate" && Date.now() - lastStateSentAtRef.current >= 3_000) {
        lastStateSentAtRef.current = Date.now();
        emitSync("state");
      }
    };
    window.addEventListener("message", onPlayerMessage);
    return () => window.removeEventListener("message", onPlayerMessage);
  }, [applyPlayback, playerRef]);

  useEffect(() => () => {
    onOpenChange?.(false);
    wsRef.current?.close();
    onSessionProviderChange?.(null);
  }, [onOpenChange, onSessionProviderChange]);

  function unlockAndSync() {
    setUnlocked(true);
    unlockedRef.current = true;
    if (pendingPlaybackRef.current) applyPlayback(pendingPlaybackRef.current, true);
  }

  function leave() {
    wsRef.current?.send(JSON.stringify({ type: roleRef.current === "host" ? "close" : "leave" }));
    window.setTimeout(() => wsRef.current?.close(), 80);
    resetSession();
  }

  async function copyInvite() {
    const url = new URL(window.location.href);
    url.searchParams.set("party", roomCodeRef.current);
    try {
      await navigator.clipboard.writeText(url.toString());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError(`Não foi possível copiar automaticamente. Compartilhe o código ${roomCodeRef.current}.`);
    }
  }

  function changeProviderForEveryone() {
    if (roleRef.current !== "host" || compatibleSources.length < 2) return;
    const currentIndex = compatibleSources.findIndex((source) => providerFor(source) === providerRef.current);
    const next = compatibleSources[(currentIndex + 1) % compatibleSources.length];
    const nextProvider = providerFor(next);
    if (!nextProvider) return;
    providerRef.current = nextProvider;
    setProviderId(nextProvider);
    onSessionProviderChange?.(nextProvider);
    onSelectSource(next.id);
    const playback: PartyPlayback = {
      paused: true,
      currentTime: currentTimeRef.current,
      updatedAt: Date.now() + serverClockOffsetRef.current,
      sequence: (pendingPlaybackRef.current?.sequence || 0) + 1,
    };
    pendingPlaybackRef.current = playback;
    pausedRef.current = true;
    window.setTimeout(() => applyPlayback(playback, true), 900);
    wsRef.current?.send(JSON.stringify({
      type: "provider",
      providerId: nextProvider,
      currentTime: currentTimeRef.current,
    }));
  }

  const providerName = compatibleSources.find((source) => providerFor(source) === providerId)?.name || providerId;

  return (
    <div className={`watch-party ${open ? "is-open" : ""} ${roomCode ? "is-connected" : ""}`} ref={menuRef}>
      <button
        type="button"
        className={`player-icon-btn watch-party-trigger ${roomCode ? "is-active" : ""}`}
        onClick={() => updateOpen(!open)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={roomCode ? `Sessão com ${participants.length} participantes` : "Assistir junto"}
      >
        <span aria-hidden="true">◉</span>
        <small>{roomCode ? participants.length : "Junto"}</small>
      </button>

      {open ? (
        <section className="watch-party-panel" role="dialog" aria-label="Assistir junto">
          <header>
            <div><small>Sessão compartilhada</small><strong>{roomCode ? `Sala ${roomCode}` : "Assistir ao mesmo tempo"}</strong></div>
            <button type="button" className="text-link" onClick={() => updateOpen(false)}>Fechar</button>
          </header>

          {!roomCode ? (
            <div className="watch-party-join">
              <p>Play, pausa e avanço ficam sincronizados. O anfitrião controla o filme para todos.</p>
              <button type="button" className="watch-party-primary" disabled={connecting || compatibleSources.length === 0} onClick={() => void connect("create")}>
                {connecting ? "Conectando…" : "Criar uma sala"}
              </button>
              <div className="watch-party-code-row">
                <input
                  value={codeInput}
                  onChange={(event) => setCodeInput(normalizeRoomCode(event.target.value))}
                  placeholder="CÓDIGO"
                  aria-label="Código da sala"
                  maxLength={6}
                />
                <button type="button" disabled={connecting || codeInput.length !== 6} onClick={() => void connect("join", codeInput)}>Entrar</button>
              </div>
              <small>{compatibleSources.length ? `${compatibleSources.length} servidor(es) compatível(is) neste título.` : "Aguardando um servidor compatível…"}</small>
            </div>
          ) : (
            <div className="watch-party-room">
              <div className="watch-party-room-top">
                <span className="watch-party-live"><i /> AO VIVO</span>
                <span>{role === "host" ? "Você é o anfitrião" : "Controle do anfitrião"}</span>
              </div>
              <div className="watch-party-invite">
                <strong>{roomCode}</strong>
                <button type="button" onClick={() => void copyInvite()}>{copied ? "Copiado!" : "Copiar convite"}</button>
              </div>
              <div className="watch-party-provider">
                <span>Player sincronizado</span>
                <strong>{providerName}</strong>
                {role === "host" && compatibleSources.length > 1 ? <button type="button" onClick={changeProviderForEveryone}>Trocar para todos</button> : null}
              </div>
              {role === "guest" && !unlocked ? (
                <button type="button" className="watch-party-primary" onClick={unlockAndSync}>Sincronizar meu player</button>
              ) : null}
              <div className="watch-party-people">
                <small>{participants.length} participante{participants.length === 1 ? "" : "s"}</small>
                <ul>
                  {participants.map((participant) => (
                    <li key={participant.id}><span>{participant.name.slice(0, 1).toUpperCase()}</span>{participant.name}{participant.host ? <em>Anfitrião</em> : null}</li>
                  ))}
                </ul>
              </div>
              <button type="button" className="watch-party-leave" onClick={leave}>{role === "host" ? "Encerrar sala para todos" : "Sair da sala"}</button>
            </div>
          )}
          {error ? <p className="watch-party-error" role="status">{error}</p> : null}
        </section>
      ) : null}
    </div>
  );
}
