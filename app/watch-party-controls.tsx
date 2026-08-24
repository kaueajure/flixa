"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import {
  Realtime,
  type InboundMessage,
  type PresenceMessage,
  type RealtimeChannel,
  type TokenRequest,
} from "ably";
import { WATCH_PARTY_ENABLED } from "../lib/feature-flags";
import { playerServerIdForSource } from "../lib/player-servers";

type PartyProviderId = "xpass" | "cinesrc";

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

type PartyRoomState = {
  media: PartyMedia;
  providerId: PartyProviderId;
  playback: PartyPlayback;
};

type PartyPresenceData = {
  name?: string;
  role?: PartyRole;
  state?: PartyRoomState;
};

type PartyRealtimeMessage = PartyRoomState & {
  type: "sync" | "provider" | "roomClosed";
  action?: "play" | "pause" | "seek" | "state";
};

type PartyChatMessage = {
  id: string;
  name: string;
  text: string;
  sentAt: number;
};

type AblyAuthResponse = {
  tokenRequest?: TokenRequest;
  session?: string;
  roomCode?: string;
  role?: PartyRole;
  clientId?: string;
  name?: string;
  erro?: string;
};

const PARTY_PROVIDERS = new Set<PartyProviderId>(["xpass", "cinesrc"]);
const PARTY_PROVIDER_PRIORITY: PartyProviderId[] = ["cinesrc", "xpass"];
const PARTY_PROVIDER_LABELS: Record<PartyProviderId, string> = {
  xpass: "Áudio PT-BR não confirmado · comandos validados",
  cinesrc: "Áudio PT-BR não confirmado · sem pop-up observado",
};
const PARTY_PROVIDER_ORIGINS: Record<PartyProviderId, string> = {
  xpass: "https://play.xpass.top",
  cinesrc: "https://cinesrc.st",
};

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
  const targetOrigin = PARTY_PROVIDER_ORIGINS[providerId];
  const safeTime = Math.max(0, Number(time) || 0);

  if (providerId === "xpass") {
    if (command === "getStatus") return;
    target.postMessage({
      type: "player.action",
      action: command,
      ...(command === "seek" ? { position: safeTime } : {}),
    }, targetOrigin);
    return;
  }

  if (providerId === "cinesrc") {
    const send = (nextCommand: string, args: unknown[] = []) => target.postMessage({
      type: "cinesrc:command",
      command: nextCommand,
      args,
    }, targetOrigin);
    if (command === "getStatus") {
      send("getCurrentTime");
      send("getPaused");
    } else {
      send(command, command === "seek" ? [safeTime] : []);
    }
    return;
  }

  target.postMessage({
    action: command,
    ...(command === "seek" ? { time: safeTime } : {}),
  }, targetOrigin);
}

function parsePlayerEvent(event: MessageEvent, providerId: PartyProviderId) {
  let payload: unknown = event.data;
  if (typeof payload === "string") {
    try {
      payload = JSON.parse(payload) as unknown;
    } catch {
      return null;
    }
  }
  if (!payload || typeof payload !== "object") return null;
  const data = payload as Record<string, unknown>;
  let details = data;
  let eventName = "";
  let command = "";
  let result: unknown = null;
  if (providerId === "xpass") {
    if (data.type !== "player.event" || !data.event || typeof data.event !== "object") return null;
    details = data.event as Record<string, unknown>;
    eventName = typeof details.name === "string" ? details.name : "";
  } else if (providerId === "cinesrc") {
    if (typeof data.type !== "string" || !data.type.startsWith("cinesrc:")) return null;
    eventName = data.type.slice("cinesrc:".length);
    command = typeof data.command === "string" ? data.command : "";
    result = data.result;
  }

  // XPass currently reports the seek destination in `from`, despite the field name.
  const xpassSeekPosition = providerId === "xpass" && eventName === "seek" ? details.from : undefined;
  const currentTime = Number(
    details.currentTime ?? details.time ?? details.position ?? xpassSeekPosition ?? data.currentTime ?? data.time,
  );
  const pausedValue = details.paused ?? data.paused;
  return {
    name: eventName.toLowerCase(),
    currentTime: Number.isFinite(currentTime) ? Math.max(0, currentTime) : null,
    paused: typeof pausedValue === "boolean" ? pausedValue : null,
    command,
    result,
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
  providerFailure,
}: {
  media: PartyMedia;
  sources: PartySource[];
  activeSource?: PartySource;
  playerRef: RefObject<HTMLIFrameElement | null>;
  onSelectSource: (id: string) => void;
  onOpenChange?: (open: boolean) => void;
  onSessionProviderChange?: (providerId: PartyProviderId | null) => void;
  providerFailure?: { sourceId: string; reason: string; sequence: number } | null;
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
  const [chatMessages, setChatMessages] = useState<PartyChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");

  const realtimeRef = useRef<Realtime | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const clientIdRef = useRef("");
  const hostClientIdRef = useRef("");
  const sessionRef = useRef("");
  const participantNameRef = useRef("");
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
  const handledFailureSequenceRef = useRef(0);
  const lastPlayerSignalRef = useRef(0);
  const failedPartyProvidersRef = useRef<Set<PartyProviderId>>(new Set());
  const lastChatSentAtRef = useRef(0);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const sourcesRef = useRef(sources);
  const mediaRef = useRef(media);
  const activeSourceRef = useRef(activeSource);

  const compatibleSources = useMemo(() => [...sources]
    .filter((source) => providerFor(source))
    .sort((left, right) => {
      const leftProvider = providerFor(left);
      const rightProvider = providerFor(right);
      return PARTY_PROVIDER_PRIORITY.indexOf(leftProvider!) - PARTY_PROVIDER_PRIORITY.indexOf(rightProvider!);
    }), [sources]);

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
    hostClientIdRef.current = "";
    sessionRef.current = "";
    pendingPlaybackRef.current = null;
    lastPlayerSignalRef.current = 0;
    failedPartyProvidersRef.current.clear();
    setRoomCode("");
    setRole("");
    setParticipants([]);
    setProviderId(null);
    setUnlocked(true);
    setChatMessages([]);
    setChatInput("");
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

  const closeRealtime = useCallback((leavePresence = true) => {
    const channel = channelRef.current;
    const realtime = realtimeRef.current;
    channelRef.current = null;
    realtimeRef.current = null;
    if (leavePresence && channel) void channel.presence.leave().catch(() => undefined);
    realtime?.close();
  }, []);

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

  const refreshParticipants = useCallback(async () => {
    const channel = channelRef.current;
    if (!channel) return [];
    const members = await channel.presence.get();
    if (channelRef.current !== channel) return [];
    const unique = new Map<string, PartyParticipant>();
    for (const member of members) {
      const data = member.data && typeof member.data === "object" ? member.data as PartyPresenceData : {};
      unique.set(member.clientId, {
        id: member.clientId,
        name: String(data.name || "Convidado").slice(0, 80),
        host: member.clientId === hostClientIdRef.current,
      });
    }
    const list = [...unique.values()].sort((a, b) => Number(b.host) - Number(a.host));
    setParticipants(list);
    return list;
  }, []);

  const publishRoomState = useCallback((
    type: PartyRealtimeMessage["type"],
    playback: PartyPlayback,
    action?: PartyRealtimeMessage["action"],
    selectedProvider = providerRef.current,
  ) => {
    const channel = channelRef.current;
    if (!channel || roleRef.current !== "host" || !selectedProvider) return;
    const state: PartyRoomState = {
      media: mediaRef.current,
      providerId: selectedProvider,
      playback,
    };
    pendingPlaybackRef.current = playback;
    void Promise.all([
      channel.publish("party", { type, action, ...state } satisfies PartyRealtimeMessage),
      channel.presence.update({ name: participantNameRef.current, role: "host", state } satisfies PartyPresenceData),
    ]).catch(() => setError("A sincronização com a sala foi interrompida. Tentando reconectar…"));
  }, []);

  const handleRealtimeMessage = useCallback((message: InboundMessage) => {
    if (!hostClientIdRef.current || message.clientId !== hostClientIdRef.current || message.clientId === clientIdRef.current) return;
    const data = message.data as Partial<PartyRealtimeMessage> | null;
    if (!data || typeof data !== "object") return;
    if (Number.isFinite(message.timestamp)) serverClockOffsetRef.current = message.timestamp - Date.now();
    if (data.type === "roomClosed") {
      closeRealtime();
      resetSession();
      setError("O anfitrião encerrou a sessão.");
      return;
    }
    if (!data.playback || !data.providerId || !PARTY_PROVIDERS.has(data.providerId)) return;
    if (data.type === "sync") {
      applyPlayback(data.playback, data.action === "seek");
    } else if (data.type === "provider") {
      selectProvider(data.providerId, data.playback);
      setError("O anfitrião trocou o servidor para todos.");
    }
  }, [applyPlayback, closeRealtime, resetSession, selectProvider]);

  const handlePresenceChange = useCallback((member: PresenceMessage) => {
    void refreshParticipants().catch(() => undefined);
    if (
      roleRef.current === "guest" &&
      member.clientId === hostClientIdRef.current &&
      (member.action === "leave" || member.action === "absent")
    ) {
      closeRealtime(false);
      resetSession(false);
      setError("O anfitrião se desconectou e a sala foi encerrada.");
    }
  }, [closeRealtime, refreshParticipants, resetSession]);

  const handleChatMessage = useCallback((message: InboundMessage) => {
    const data = message.data as Partial<PartyChatMessage> | null;
    if (!data || typeof data !== "object" || typeof data.text !== "string") return;
    const text = data.text.trim().slice(0, 240);
    const name = typeof data.name === "string" ? data.name.trim().slice(0, 80) : "Convidado";
    const id = typeof data.id === "string" ? data.id.slice(0, 120) : `${message.clientId}:${message.timestamp}`;
    if (!text || !id) return;
    const next: PartyChatMessage = {
      id,
      name: name || "Convidado",
      text,
      sentAt: Number.isFinite(Number(data.sentAt)) ? Number(data.sentAt) : Number(message.timestamp) || Date.now(),
    };
    setChatMessages((current) => current.some((item) => item.id === id) ? current : [...current, next].slice(-60));
  }, []);

  const connect = useCallback(async (mode: "create" | "join", requestedCode = "") => {
    if (!WATCH_PARTY_ENABLED) {
      setError("O Assistir Junto está temporariamente desabilitado.");
      updateOpen(true);
      return;
    }
    if (connecting) return;
    const activeProvider = providerFor(activeSourceRef.current);
    const candidate = mode === "create"
      ? (activeProvider
        ? sourcesRef.current.find((source) => source.id === activeSourceRef.current?.id)
        : null) ?? [...sourcesRef.current]
        .filter((source) => providerFor(source))
        .sort((left, right) => PARTY_PROVIDER_PRIORITY.indexOf(providerFor(left)!) - PARTY_PROVIDER_PRIORITY.indexOf(providerFor(right)!))[0]
      : null;
    if (mode === "create" && !candidate) {
      setError("Nenhum bridge de grupo está disponível para este título.");
      updateOpen(true);
      return;
    }
    const requestedRoomCode = normalizeRoomCode(requestedCode);
    if (mode === "join" && requestedRoomCode.length !== 6) {
      setError("Digite o código de 6 caracteres da sala.");
      updateOpen(true);
      return;
    }

    setConnecting(true);
    setError("");
    updateOpen(true);
    closeRealtime();

    try {
      const response = await fetch("/api/watch-party/ticket", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: mode, roomCode: requestedRoomCode }),
      });
      const data = await response.json() as AblyAuthResponse;
      if (!response.ok || !data.tokenRequest || !data.session || !data.roomCode || !data.clientId || !data.role) {
        throw new Error(data.erro || "Não foi possível autenticar a sessão.");
      }

      const code = data.roomCode;
      let initialToken: TokenRequest | null = data.tokenRequest;
      sessionRef.current = data.session;
      participantNameRef.current = String(data.name || "Convidado").slice(0, 80);
      clientIdRef.current = data.clientId;

      const realtime = new Realtime({
        autoConnect: false,
        authCallback: (_params, callback) => {
          if (initialToken) {
            const token = initialToken;
            initialToken = null;
            callback(null, token);
            return;
          }
          void fetch("/api/watch-party/ticket", {
            method: "POST",
            credentials: "include",
            cache: "no-store",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "refresh", session: sessionRef.current }),
          }).then(async (refreshResponse) => {
            const refreshed = await refreshResponse.json() as AblyAuthResponse;
            if (!refreshResponse.ok || !refreshed.tokenRequest) throw new Error(refreshed.erro || "A sessão expirou.");
            if (refreshed.session) sessionRef.current = refreshed.session;
            callback(null, refreshed.tokenRequest);
          }).catch((cause) => callback(cause instanceof Error ? cause.message : "Falha ao renovar a sessão.", null));
        },
      });
      realtimeRef.current = realtime;
      realtime.connection.on("suspended", () => setError("Conexão instável. O Ably está tentando reconectar…"));
      realtime.connection.on("failed", (change) => {
        setConnecting(false);
        setError(change.reason?.message || "A conexão em tempo real com o Ably falhou.");
      });
      realtime.connect();

      let timeoutId = 0;
      await Promise.race([
        realtime.connection.whenState("connected"),
        realtime.connection.whenState("failed").then((change) => {
          throw new Error(change?.reason?.message || "O Ably recusou a conexão.");
        }),
        new Promise((_, reject) => {
          timeoutId = window.setTimeout(() => reject(new Error("O Ably demorou demais para responder.")), 15_000);
        }),
      ]).finally(() => window.clearTimeout(timeoutId));
      if (realtimeRef.current !== realtime) return;

      try {
        serverClockOffsetRef.current = await realtime.time() - Date.now();
      } catch {
        serverClockOffsetRef.current = 0;
      }

      const channel = realtime.channels.get(`watch-party:${code}`);
      channelRef.current = channel;
      await channel.subscribe("party", handleRealtimeMessage);
      await channel.subscribe("chat", handleChatMessage);
      await channel.presence.subscribe(handlePresenceChange);
      await channel.attach();

      try {
        const history = await channel.history({ limit: 50, direction: "forwards" });
        for (const message of history.items) {
          if (message.name === "chat") handleChatMessage(message);
        }
      } catch {
        // O chat ao vivo continua funcionando mesmo sem histórico anterior.
      }

      let roomState: PartyRoomState;
      if (mode === "create" && candidate) {
        const nextProvider = providerFor(candidate);
        if (!nextProvider) throw new Error("O player escolhido não permite sincronização.");
        onSelectSource(candidate.id);
        const playback: PartyPlayback = {
          paused: true,
          currentTime: 0,
          updatedAt: Date.now() + serverClockOffsetRef.current,
          sequence: 0,
        };
        roomState = { media: mediaRef.current, providerId: nextProvider, playback };
        hostClientIdRef.current = data.clientId;
        await channel.presence.enter({ name: participantNameRef.current, role: "host", state: roomState } satisfies PartyPresenceData);
        await channel.publish("party", { type: "sync", action: "state", ...roomState } satisfies PartyRealtimeMessage);
      } else {
        const members = await channel.presence.get();
        const host = members.find((member) => {
          const presence = member.data && typeof member.data === "object" ? member.data as PartyPresenceData : {};
          return member.clientId.startsWith("host:") && presence.role === "host" && presence.state;
        });
        if (!host) throw new Error("Sala não encontrada ou o anfitrião está desconectado.");
        if (members.length >= 12) throw new Error("Esta sala atingiu o limite de 12 participantes.");
        hostClientIdRef.current = host.clientId;
        roomState = (host.data as PartyPresenceData).state as PartyRoomState;
        const joinedMedia = roomState.media;
        const currentMedia = mediaRef.current;
        const sameEpisode = currentMedia.kind !== "tv" || (
          Number(joinedMedia?.season) === Number(currentMedia.season) &&
          Number(joinedMedia?.episode) === Number(currentMedia.episode)
        );
        if (!joinedMedia || joinedMedia.id !== currentMedia.id || joinedMedia.kind !== currentMedia.kind || !sameEpisode) {
          throw new Error(`Esta sala está assistindo outro ${joinedMedia?.kind === "tv" ? "episódio" : "filme"}. Abra o link completo do convite.`);
        }
        await channel.presence.enter({ name: participantNameRef.current, role: "guest" } satisfies PartyPresenceData);
      }

      const joinedMedia = roomState.media;
      const currentMedia = mediaRef.current;
      const sameEpisode = currentMedia.kind !== "tv" || (
        Number(joinedMedia?.season) === Number(currentMedia.season) &&
        Number(joinedMedia?.episode) === Number(currentMedia.episode)
      );
      if (!joinedMedia || joinedMedia.id !== currentMedia.id || joinedMedia.kind !== currentMedia.kind || !sameEpisode) {
        throw new Error(`Esta sala está assistindo outro ${joinedMedia?.kind === "tv" ? "episódio" : "filme"}. Abra o link completo do convite.`);
      }

      roomCodeRef.current = code;
      roleRef.current = data.role;
      setRoomCode(code);
      setRole(data.role);
      const canControl = data.role === "host";
      setUnlocked(canControl);
      unlockedRef.current = canControl;
      if (!selectProvider(roomState.providerId, roomState.playback)) throw new Error("O player da sala não está disponível neste título.");
      await refreshParticipants();
      setConnecting(false);
      setError("");
      const url = new URL(window.location.href);
      url.searchParams.set("party", code);
      window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    } catch (cause) {
      closeRealtime();
      resetSession(false);
      setConnecting(false);
      setError(cause instanceof Error ? cause.message : "Não foi possível abrir a sessão.");
    }
  }, [
    closeRealtime,
    connecting,
    handlePresenceChange,
    handleChatMessage,
    handleRealtimeMessage,
    onSelectSource,
    refreshParticipants,
    resetSession,
    selectProvider,
    updateOpen,
  ]);

  useEffect(() => {
    if (!WATCH_PARTY_ENABLED) {
      autoJoinAttemptedRef.current = true;
      return;
    }
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
      const expectedOrigin = PARTY_PROVIDER_ORIGINS[currentProvider];
      if (event.origin !== expectedOrigin) return;
      const playerEvent = parsePlayerEvent(event, currentProvider);
      if (!playerEvent) return;
      const confirmsPlayback = ["ready", "loadedmetadata", "timeupdate", "position", "play", "pause", "seek", "seeked", "playerstatus"].includes(playerEvent.name)
        || (playerEvent.name === "response" && (
          Number.isFinite(Number(playerEvent.result)) || typeof playerEvent.result === "boolean"
        ));
      if (confirmsPlayback) {
        lastPlayerSignalRef.current = Date.now();
        failedPartyProvidersRef.current.delete(currentProvider);
      }

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
      const emitSync = (action: "play" | "pause" | "seek" | "state") => {
        const playback: PartyPlayback = {
          currentTime: currentTimeRef.current,
          paused: pausedRef.current,
          updatedAt: Date.now() + serverClockOffsetRef.current,
          sequence: (pendingPlaybackRef.current?.sequence || 0) + 1,
        };
        publishRoomState("sync", playback, action);
      };
      if (playerEvent.name === "play") emitSync("play");
      else if (playerEvent.name === "pause" || playerEvent.name === "ended") emitSync("pause");
      else if (playerEvent.name === "seek" || playerEvent.name === "seeked") emitSync("seek");
      else if (["position", "timeupdate"].includes(playerEvent.name) && Date.now() - lastStateSentAtRef.current >= 3_000) {
        lastStateSentAtRef.current = Date.now();
        emitSync("state");
      }
    };
    window.addEventListener("message", onPlayerMessage);
    return () => window.removeEventListener("message", onPlayerMessage);
  }, [applyPlayback, playerRef, publishRoomState]);

  useEffect(() => () => {
    onOpenChange?.(false);
    closeRealtime();
    onSessionProviderChange?.(null);
  }, [closeRealtime, onOpenChange, onSessionProviderChange]);

  function unlockAndSync() {
    setUnlocked(true);
    unlockedRef.current = true;
    if (pendingPlaybackRef.current) applyPlayback(pendingPlaybackRef.current, true);
  }

  async function leave() {
    const channel = channelRef.current;
    if (roleRef.current === "host" && channel && providerRef.current) {
      const playback: PartyPlayback = {
        paused: pausedRef.current,
        currentTime: currentTimeRef.current,
        updatedAt: Date.now() + serverClockOffsetRef.current,
        sequence: (pendingPlaybackRef.current?.sequence || 0) + 1,
      };
      try {
        await channel.publish("party", {
          type: "roomClosed",
          media: mediaRef.current,
          providerId: providerRef.current,
          playback,
        } satisfies PartyRealtimeMessage);
      } catch {
        // A saída local continua mesmo se a última mensagem não puder ser entregue.
      }
    }
    closeRealtime();
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

  const changeProviderForEveryone = useCallback((automaticReason?: string) => {
    if (roleRef.current !== "host") return false;
    if (automaticReason && providerRef.current) failedPartyProvidersRef.current.add(providerRef.current);
    const alternatives = compatibleSources.filter((source) => {
      const candidateProvider = providerFor(source);
      return candidateProvider
        && candidateProvider !== providerRef.current
        && !failedPartyProvidersRef.current.has(candidateProvider);
    });
    if (alternatives.length === 0) {
      if (automaticReason) setError("O player da sessão falhou e não há outro servidor sincronizado disponível.");
      return false;
    }
    const next = alternatives[0];
    const nextProvider = providerFor(next);
    if (!nextProvider) return false;
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
    publishRoomState("provider", playback, undefined, nextProvider);
    setError(automaticReason ? `${automaticReason} Trocando todos para ${next.name}.` : "");
    return true;
  }, [applyPlayback, compatibleSources, onSelectSource, onSessionProviderChange, publishRoomState]);

  useEffect(() => {
    if (!roomCode || !providerId || providerFor(activeSource) !== providerId) return;
    // XPass só resolve a mídia depois do primeiro gesto no player e então passa
    // a emitir posição continuamente. Um timeout antes desse gesto descartaria
    // uma fonte saudável enquanto o usuário ainda está no pôster.
    if (providerId === "xpass") return;
    lastPlayerSignalRef.current = 0;
    const probe = window.setInterval(() => sendPlayerCommand(playerRef.current, providerId, "getStatus"), 1_500);
    const timeout = window.setTimeout(() => {
      window.clearInterval(probe);
      if (lastPlayerSignalRef.current > 0) return;
      const reason = `${PARTY_PROVIDER_LABELS[providerId]} não confirmou o player neste título.`;
      if (roleRef.current === "host") changeProviderForEveryone(reason);
      else setError("O player não respondeu. Aguardando o anfitrião trocar o servidor da sala.");
    }, 10_000);
    return () => {
      window.clearInterval(probe);
      window.clearTimeout(timeout);
    };
  }, [activeSource, changeProviderForEveryone, playerRef, providerId, roomCode]);

  useEffect(() => {
    if (!providerFailure || providerFailure.sequence <= handledFailureSequenceRef.current || !roomCodeRef.current) return;
    handledFailureSequenceRef.current = providerFailure.sequence;
    if (playerServerIdForSource(providerFailure.sourceId) !== providerRef.current) return;
    if (roleRef.current === "host") {
      changeProviderForEveryone(`O servidor anterior falhou (${providerFailure.reason}).`);
      return;
    }
    setError("Seu player apresentou uma falha. Aguardando o anfitrião trocar o servidor para toda a sala.");
  }, [changeProviderForEveryone, providerFailure]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ block: "nearest" });
  }, [chatMessages.length]);

  function sendChat(textValue = chatInput) {
    const channel = channelRef.current;
    const text = textValue.trim().slice(0, 240);
    if (!channel || !roomCodeRef.current || !text || Date.now() - lastChatSentAtRef.current < 600) return;
    lastChatSentAtRef.current = Date.now();
    const message: PartyChatMessage = {
      id: `${clientIdRef.current}:${Date.now()}`,
      name: participantNameRef.current || "Convidado",
      text,
      sentAt: Date.now() + serverClockOffsetRef.current,
    };
    setChatInput("");
    void channel.publish("chat", message).catch(() => setError("Não foi possível enviar a mensagem."));
  }

  const providerName = compatibleSources.find((source) => providerFor(source) === providerId)?.name || providerId;

  return (
    <div className={`watch-party ${open ? "is-open" : ""} ${roomCode ? "is-connected" : ""}`} ref={menuRef}>
      <button
        type="button"
        className={`player-icon-btn watch-party-trigger ${roomCode ? "is-active" : ""} ${!WATCH_PARTY_ENABLED ? "is-disabled" : ""}`}
        onClick={() => updateOpen(!open)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={roomCode
          ? `Sessão com ${participants.length} participantes`
          : WATCH_PARTY_ENABLED ? "Assistir junto" : "Assistir junto temporariamente desabilitado"}
        title={!WATCH_PARTY_ENABLED ? "Assistir Junto temporariamente desabilitado" : undefined}
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
              <p>{WATCH_PARTY_ENABLED
                ? compatibleSources.length
                  ? "Play, pausa e avanço ficam sincronizados. Os bridges atuais não confirmaram áudio PT-BR para este título."
                  : "Nenhum bridge de grupo está disponível para este título."
                : "O Assistir Junto continua no Flixa, mas está temporariamente desabilitado para uso."}</p>
              <button type="button" className="watch-party-primary" disabled={!WATCH_PARTY_ENABLED || connecting || compatibleSources.length === 0} onClick={() => void connect("create")}>
                {!WATCH_PARTY_ENABLED ? "Temporariamente indisponível" : connecting ? "Conectando…" : "Criar uma sala"}
              </button>
              <div className="watch-party-code-row">
                <input
                  value={codeInput}
                  onChange={(event) => setCodeInput(normalizeRoomCode(event.target.value))}
                  placeholder="CÓDIGO"
                  aria-label="Código da sala"
                  maxLength={6}
                  disabled={!WATCH_PARTY_ENABLED || compatibleSources.length === 0}
                />
                <button type="button" disabled={!WATCH_PARTY_ENABLED || connecting || compatibleSources.length === 0 || codeInput.length !== 6} onClick={() => void connect("join", codeInput)}>Entrar</button>
              </div>
              <small>{WATCH_PARTY_ENABLED
                ? compatibleSources.length
                  ? `${compatibleSources.length} bridges com comandos reais; nenhum é apresentado como dublado sem confirmação da faixa.`
                  : "Nenhum player passou nos requisitos de sandbox e sincronização para este título."
                : "Criação, entrada por código e links de convite estão bloqueados."}</small>
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
                {providerId ? <small>{PARTY_PROVIDER_LABELS[providerId]}</small> : null}
                {role === "host" && compatibleSources.length > 1 ? <button type="button" onClick={() => changeProviderForEveryone()}>Trocar para todos</button> : null}
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
              <div className="watch-party-chat">
                <div className="watch-party-chat-head"><strong>Chat da sala</strong><small>{chatMessages.length} mensagens</small></div>
                <div className="watch-party-chat-messages" aria-live="polite">
                  {chatMessages.length ? chatMessages.map((message) => (
                    <article className={message.name === participantNameRef.current ? "is-mine" : ""} key={message.id}>
                      <small>{message.name}</small>
                      <p>{message.text}</p>
                    </article>
                  )) : <p className="watch-party-chat-empty">Envie a primeira mensagem para a sala.</p>}
                  <div ref={chatEndRef} />
                </div>
                <div className="watch-party-reactions" aria-label="Reações rápidas">
                  {["😂", "😱", "❤️", "🍿", "👏"].map((emoji) => <button type="button" key={emoji} onClick={() => sendChat(emoji)}>{emoji}</button>)}
                </div>
                <form onSubmit={(event) => { event.preventDefault(); sendChat(); }}>
                  <input value={chatInput} onChange={(event) => setChatInput(event.target.value.slice(0, 240))} placeholder="Mensagem para a sala…" maxLength={240} aria-label="Mensagem para a sala" />
                  <button type="submit" disabled={!chatInput.trim()}>Enviar</button>
                </form>
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
