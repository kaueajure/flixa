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

import { PARTY_PLAYER_ORIGIN, cineSrcCommand, parseCineSrcEvent, parsePartyRoomState, partyTargetTime, samePartyMedia, samePartyDuration, type PartyProviderId, type PartyMedia, type PartyPlayback, type PartyRoomState } from "../lib/watch-party";

type PartySource = {
  id: string;
  name: string;
  src: string;
};

type WatchPartyControlsProps = {
  media: PartyMedia;
  sources: PartySource[];
  activeSource?: PartySource;
  playerRef: RefObject<HTMLIFrameElement | null>;
  onSelectSource: (id: string) => void;
  onOpenChange?: (open: boolean) => void;
  onSessionProviderChange?: (providerId: string | null) => void;
  providerFailure?: { sourceId: string; reason: string; sequence: number } | null;
};

type PartyParticipant = {
  id: string;
  name: string;
  host: boolean;
};

type PartyRole = "host" | "guest" | "";

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

const PARTY_PROVIDERS = new Set<PartyProviderId>(["cinesrc"]);
const PARTY_PROVIDER_LABELS: Record<PartyProviderId, string> = { cinesrc: "Play, pausa e posição sincronizados" };

function providerFor(source?: PartySource): PartyProviderId | null {
  if (!source) return null;
  const id = playerServerIdForSource(source.id) as PartyProviderId;
  try { return PARTY_PROVIDERS.has(id) && new URL(source.src).origin === PARTY_PLAYER_ORIGIN ? id : null; } catch { return null; }
}

function normalizeRoomCode(value: string) {
  return value.toUpperCase().replace(/[^A-Z2-9]/g, "").slice(0, 6);
}

function currentTimestamp() {
  return Date.now();
}

function sendPlayerCommand(
  iframe: HTMLIFrameElement | null,
  providerId: PartyProviderId,
  command: "play" | "pause" | "seek" | "getStatus",
  time?: number,
) {
  const target = iframe?.contentWindow;
  if (!target) return;
  if (providerId !== "cinesrc") return;
  target.postMessage(cineSrcCommand(command, time), PARTY_PLAYER_ORIGIN);
  if (command === "getStatus") target.postMessage({ type: "cinesrc:command", command: "getPaused", args: [] }, PARTY_PLAYER_ORIGIN);
}

function parsePlayerEvent(event: MessageEvent, providerId: PartyProviderId) {
  return providerId === "cinesrc" ? parseCineSrcEvent(event.data) : null;
}

function ActiveWatchPartyControls({
  media,
  sources,
  activeSource,
  playerRef,
  onSelectSource,
  onOpenChange,
  onSessionProviderChange,
  providerFailure,
}: WatchPartyControlsProps) {
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
  const [participantName, setParticipantName] = useState("");

  const realtimeRef = useRef<Realtime | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const chatChannelRef = useRef<RealtimeChannel | null>(null);
  const connectPendingRef = useRef(false);
  const connectGenerationRef = useRef(0);
  const disconnectedHostTimerRef = useRef<number | null>(null);
  const retryPlaybackTimerRef = useRef<number | null>(null);
  const initialPlaybackTimerRef = useRef<number | null>(null);
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
  const durationRef = useRef(0);
  const unlockedRef = useRef(true);
  const pendingPlaybackRef = useRef<PartyPlayback | null>(null);
  const applyingRemoteUntilRef = useRef(0);
  const lastStateSentAtRef = useRef(0);
  const serverClockOffsetRef = useRef(0);
  const autoJoinAttemptedRef = useRef(false);
  const handledFailureSequenceRef = useRef(0);
  const lastChatSentAtRef = useRef(0);
  const lastHostStateAtRef = useRef(0);
  const hostStateStaleRef = useRef(false);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const sourcesRef = useRef(sources);
  const mediaRef = useRef(media);
  const activeSourceRef = useRef(activeSource);

  const compatibleSources = useMemo(() => sources.filter(source => providerFor(source)), [sources]);


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
    hostStateStaleRef.current = false;
    hostClientIdRef.current = "";
    sessionRef.current = "";
    pendingPlaybackRef.current = null;
    if (disconnectedHostTimerRef.current) window.clearTimeout(disconnectedHostTimerRef.current);
    if (retryPlaybackTimerRef.current) window.clearTimeout(retryPlaybackTimerRef.current);
    if (initialPlaybackTimerRef.current) window.clearTimeout(initialPlaybackTimerRef.current);
    setRoomCode("");
    setRole("");
    setParticipants([]);
    setProviderId(null);
    setUnlocked(true);
    setChatMessages([]);
    setChatInput("");
    setParticipantName("");
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
    chatChannelRef.current = null;
    realtimeRef.current = null;
    if (leavePresence && channel) void channel.presence.leave().catch(() => undefined);
    realtime?.close();
  }, []);

  const applyPlayback = useCallback((playback: PartyPlayback, force = false) => {
    pendingPlaybackRef.current = playback;
    if (!providerRef.current || (!unlockedRef.current && roleRef.current === "guest")) return;
    if (roleRef.current === "guest" && !samePartyDuration(playback.durationSeconds, durationRef.current)) {
      applyingRemoteUntilRef.current = Date.now() + 800;
      sendPlayerCommand(playerRef.current, providerRef.current, "pause");
      setError("O player carregou uma versão diferente da do anfitrião. Escolha a mesma versão no player antes de sincronizar.");
      return;
    }
    const serverTimeNow = Date.now() + serverClockOffsetRef.current;
    const targetTime = partyTargetTime(playback, serverTimeNow);
    if (roleRef.current === "guest") applyingRemoteUntilRef.current = Date.now() + 800;
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
    onSessionProviderChange?.(source.id);
    if (activeSourceRef.current?.id !== source.id) onSelectSource(source.id);
    if (playback) {
      pendingPlaybackRef.current = playback;
      if (initialPlaybackTimerRef.current) window.clearTimeout(initialPlaybackTimerRef.current);
      initialPlaybackTimerRef.current = window.setTimeout(() => {
        if (roomCodeRef.current && pendingPlaybackRef.current) applyPlayback(pendingPlaybackRef.current, true);
      }, 900);
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
      playback: { ...playback, ...(durationRef.current > 0 ? { durationSeconds: durationRef.current } : {}) },
    };
    pendingPlaybackRef.current = state.playback;
    void Promise.all([
      channel.publish("party", { type, action, ...state } satisfies PartyRealtimeMessage),
      channel.presence.update({ name: participantNameRef.current, role: "host", state } satisfies PartyPresenceData),
    ]).catch(() => setError("A sincronização com a sala foi interrompida. Tentando reconectar…"));
  }, []);

  const handleRealtimeMessage = useCallback((message: InboundMessage) => {
    if (!hostClientIdRef.current || message.clientId !== hostClientIdRef.current || message.clientId === clientIdRef.current) return;
    const data = message.data as Partial<PartyRealtimeMessage> | null;
    if (!data || typeof data !== "object") return;
    if (data.type === "roomClosed") {
      closeRealtime();
      resetSession();
      setError("O anfitrião encerrou a sessão.");
      return;
    }
    const state = parsePartyRoomState(data);
    if (!state || !samePartyMedia(state.media, mediaRef.current)) return;
    if (state.playback.sequence <= (pendingPlaybackRef.current?.sequence ?? -1)) return;
    lastHostStateAtRef.current = Date.now();
    if (hostStateStaleRef.current) { hostStateStaleRef.current = false; setError(""); }
    if (data.type === "sync") {
      if (state.providerId !== providerRef.current) return;
      applyPlayback(state.playback, data.action === "seek");
    } else if (data.type === "provider") {
      selectProvider(state.providerId, state.playback);
      setError("O anfitrião trocou o servidor para todos.");
    }
  }, [applyPlayback, closeRealtime, resetSession, selectProvider]);

  const handlePresenceChange = useCallback((member: PresenceMessage) => {
    void refreshParticipants().catch(() => undefined);
    if (roleRef.current !== "guest" || member.clientId !== hostClientIdRef.current) return;
    if (member.action === "leave" || member.action === "absent") {
      setError("O anfitrião se desconectou. Aguardando reconexão…");
      if (disconnectedHostTimerRef.current) window.clearTimeout(disconnectedHostTimerRef.current);
      disconnectedHostTimerRef.current = window.setTimeout(() => {
        closeRealtime(false);
        resetSession(false);
        setError("O anfitrião não retornou. Entre novamente pelo convite.");
      }, 30_000);
    } else {
      if (disconnectedHostTimerRef.current) window.clearTimeout(disconnectedHostTimerRef.current);
      const state = parsePartyRoomState((member.data as PartyPresenceData | undefined)?.state);
      if (state && samePartyMedia(state.media, mediaRef.current) && state.playback.sequence > (pendingPlaybackRef.current?.sequence ?? -1)) applyPlayback(state.playback);
      setError("");
    }
  }, [applyPlayback, closeRealtime, refreshParticipants, resetSession]);

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
    if (connectPendingRef.current) return;
    const generation = ++connectGenerationRef.current;
    const candidate = mode === "create"
      ? sourcesRef.current.find(source => providerFor(source))
      : null;
    if (mode === "create" && !candidate) {
      setError("Nenhum player compatível com sessão compartilhada está disponível para este título.");
      updateOpen(true);
      return;
    }
    const requestedRoomCode = normalizeRoomCode(requestedCode);
    if (mode === "join" && requestedRoomCode.length !== 6) {
      setError("Digite o código de 6 caracteres da sala.");
      updateOpen(true);
      return;
    }

    connectPendingRef.current = true;
    setConnecting(true);
    setError("");
    updateOpen(true);
    closeRealtime();
    if (candidate) onSelectSource(candidate.id);

    try {
      const response = await fetch("/api/watch-party/ticket", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: mode, roomCode: requestedRoomCode }),
      });
      const data = await response.json() as AblyAuthResponse;
      if (generation !== connectGenerationRef.current) return;
      if (!response.ok || !data.tokenRequest || !data.session || !data.roomCode || !data.clientId || !data.role) {
        throw new Error(data.erro || "Não foi possível autenticar a sessão.");
      }

      const code = data.roomCode;
      let initialToken: TokenRequest | null = data.tokenRequest;
      sessionRef.current = data.session;
      participantNameRef.current = String(data.name || "Convidado").slice(0, 80);
      setParticipantName(participantNameRef.current);
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
      realtime.connection.on("connected", () => {
        const existingChannel = channelRef.current;
        if (!roomCodeRef.current || !existingChannel) return;
        void existingChannel.presence.get().then((members) => {
          if (existingChannel !== channelRef.current) return;
          const host = members.find((member) => member.clientId === hostClientIdRef.current);
          const state = parsePartyRoomState((host?.data as PartyPresenceData | undefined)?.state);
          if (roleRef.current === "guest" && state && samePartyMedia(state.media, mediaRef.current)) applyPlayback(state.playback, true);
          setError("");
        }).catch(() => setError("Reconectado. Aguardando o estado do anfitrião…"));
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
      const chatChannel = realtime.channels.get(`watch-party:${code}:chat`);
      chatChannelRef.current = chatChannel;
      await chatChannel.subscribe("chat", handleChatMessage);
      await channel.presence.subscribe(handlePresenceChange);
      await channel.attach();

      try {
        const history = await chatChannel.history({ limit: 50, direction: "forwards" });
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
        const validState = parsePartyRoomState((host.data as PartyPresenceData).state);
        if (!validState) throw new Error("A sala não tem um estado válido de reprodução.");
        roomState = validState;
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

      if (generation !== connectGenerationRef.current || realtimeRef.current !== realtime) return;
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
      lastHostStateAtRef.current = Date.now();
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
      if (generation !== connectGenerationRef.current) return;
      closeRealtime();
      resetSession(false);
      setConnecting(false);
      setError(cause instanceof Error ? cause.message : "Não foi possível abrir a sessão.");
    } finally {
      if (generation === connectGenerationRef.current) connectPendingRef.current = false;
    }
  }, [
    applyPlayback,
    closeRealtime,
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
      if (!currentProvider || !iframe?.contentWindow) return;
      if (event.source !== iframe.contentWindow || event.origin !== PARTY_PLAYER_ORIGIN) return;
      const playerEvent = parsePlayerEvent(event, currentProvider);
      if (!playerEvent) return;

      if (playerEvent.name === "response") {
        if (playerEvent.command === "getCurrentTime" && Number.isFinite(Number(playerEvent.result))) {
          currentTimeRef.current = Math.max(0, Number(playerEvent.result));
        }
        if (playerEvent.command === "getPaused" && typeof playerEvent.result === "boolean") {
          pausedRef.current = playerEvent.result;
          if (roleRef.current === "host" && roomCodeRef.current && Date.now() - lastStateSentAtRef.current >= 2500) {
            lastStateSentAtRef.current = Date.now();
            publishRoomState("sync", { paused: pausedRef.current, currentTime: currentTimeRef.current, updatedAt: Date.now() + serverClockOffsetRef.current, sequence: (pendingPlaybackRef.current?.sequence || 0) + 1 }, "state");
          }
        }
        return;
      }
      if (playerEvent.currentTime != null) currentTimeRef.current = playerEvent.currentTime;
      if (playerEvent.duration != null) durationRef.current = playerEvent.duration;
      if (playerEvent.paused != null) pausedRef.current = playerEvent.paused;
      if (playerEvent.name === "play") pausedRef.current = false;
      if (playerEvent.name === "pause" || playerEvent.name === "ended") pausedRef.current = true;
      if (playerEvent.name === "error") setError("O player informou uma falha de reprodução. Tente recarregar o player.");
      if ((playerEvent.name === "ready" || playerEvent.name === "loadedmetadata") && pendingPlaybackRef.current) {
        applyPlayback(pendingPlaybackRef.current, true);
      }
      if (roleRef.current === "guest" && pendingPlaybackRef.current) {
        if (playerEvent.name === "play" && !unlockedRef.current) {
          unlockedRef.current = true;
          setUnlocked(true);
          applyPlayback(pendingPlaybackRef.current, true);
        } else if (["play", "pause", "seeked"].includes(playerEvent.name) && Date.now() >= applyingRemoteUntilRef.current) {
          if (retryPlaybackTimerRef.current) window.clearTimeout(retryPlaybackTimerRef.current);
          retryPlaybackTimerRef.current = window.setTimeout(() => {
            if (pendingPlaybackRef.current) applyPlayback(pendingPlaybackRef.current);
          }, 150);
        }
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
      else if (playerEvent.name === "seeked") emitSync("seek");
      else if (playerEvent.name === "timeupdate" && Date.now() - lastStateSentAtRef.current >= 3_000) {
        lastStateSentAtRef.current = Date.now();
        emitSync("state");
      }
    };
    window.addEventListener("message", onPlayerMessage);
    return () => window.removeEventListener("message", onPlayerMessage);
  }, [applyPlayback, playerRef, publishRoomState]);

  useEffect(() => {
    if (!roomCode) return;
    const timer = window.setInterval(() => {
      if (roleRef.current === "host" && providerRef.current) sendPlayerCommand(playerRef.current, providerRef.current, "getStatus");
      if (roleRef.current === "guest" && providerRef.current && !hostStateStaleRef.current && Date.now() - lastHostStateAtRef.current > 12_000) {
        hostStateStaleRef.current = true;
        sendPlayerCommand(playerRef.current, providerRef.current, "pause");
        setError("Sem atualização do anfitrião. Reprodução pausada até a sincronização retornar.");
      }
    }, 3000);
    return () => window.clearInterval(timer);
  }, [playerRef, roomCode]);

  useEffect(() => () => {
    ++connectGenerationRef.current;
    if (disconnectedHostTimerRef.current) window.clearTimeout(disconnectedHostTimerRef.current);
    if (retryPlaybackTimerRef.current) window.clearTimeout(retryPlaybackTimerRef.current);
    if (initialPlaybackTimerRef.current) window.clearTimeout(initialPlaybackTimerRef.current);
    onOpenChange?.(false);
    closeRealtime();
    onSessionProviderChange?.(null);
  }, [closeRealtime, onOpenChange, onSessionProviderChange]);

  function unlockAndSync() {
    setError("Clique no play dentro do vídeo uma vez para permitir a reprodução. Depois os controles seguem o anfitrião.");
    if (pendingPlaybackRef.current && unlockedRef.current) applyPlayback(pendingPlaybackRef.current, true);
  }

  function hostCommand(command: "play" | "pause") {
    if (roleRef.current !== "host" || !providerRef.current) return;
    sendPlayerCommand(playerRef.current, providerRef.current, command);
    if (command === "play") setError("Se o vídeo não iniciar, clique no play dentro do player uma vez.");
  }

  async function leave() {
    ++connectGenerationRef.current;
    connectPendingRef.current = false;
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

  useEffect(() => {
    if (!providerFailure || providerFailure.sequence <= handledFailureSequenceRef.current || !roomCodeRef.current) return;
    handledFailureSequenceRef.current = providerFailure.sequence;
    if (playerServerIdForSource(providerFailure.sourceId) !== providerRef.current) return;
    queueMicrotask(() => setError(`O player apresentou uma falha (${providerFailure.reason}). Recarregue o player ou encerre a sala e tente novamente.`));
  }, [providerFailure]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ block: "nearest" });
  }, [chatMessages.length]);

  function sendChat(textValue = chatInput) {
    const channel = chatChannelRef.current;
    const text = textValue.trim().slice(0, 240);
    const now = currentTimestamp();
    if (!channel || !roomCodeRef.current || !text || now - lastChatSentAtRef.current < 600) return;
    lastChatSentAtRef.current = now;
    const message: PartyChatMessage = {
      id: `${clientIdRef.current}:${now}`,
      name: participantNameRef.current || "Convidado",
      text,
      sentAt: now + serverClockOffsetRef.current,
    };
    setChatInput("");
    void channel.publish("chat", message).catch(() => setError("Não foi possível enviar a mensagem."));
  }

  const providerName = sources.find((source) => providerFor(source) === providerId)?.name || providerId;

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
        <small>{roomCode ? participants.length : "Grupo"}</small>
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
              <small>Sincronização pelo player CineSrc.</small>
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
              </div>
              {role === "guest" && !unlocked ? (
                <button type="button" className="watch-party-primary" onClick={unlockAndSync}>Liberar reprodução e sincronizar</button>
              ) : null}
              {role === "host" ? <div className="watch-party-code-row" aria-label="Controles do anfitrião">
                <button type="button" onClick={() => hostCommand("play")}>Reproduzir para todos</button>
                <button type="button" onClick={() => hostCommand("pause")}>Pausar para todos</button>
              </div> : <small>O anfitrião controla a reprodução. Clique no play do vídeo uma vez para liberar o áudio.</small>}
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
                    <article className={message.name === participantName ? "is-mine" : ""} key={message.id}>
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

function UnavailableWatchPartyControls({
  onOpenChange,
  onSessionProviderChange,
}: WatchPartyControlsProps) {
  useEffect(() => {
    onOpenChange?.(false);
    onSessionProviderChange?.(null);
    const url = new URL(window.location.href);
    if (!url.searchParams.has("party")) return;
    url.searchParams.delete("party");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }, [onOpenChange, onSessionProviderChange]);

  return (
    <div className="watch-party is-unavailable">
      <button
        type="button"
        className="player-icon-btn watch-party-trigger is-disabled"
        aria-label="Assistir junto temporariamente indisponível"
        aria-disabled="true"
        disabled
      >
        <span aria-hidden="true">◉</span>
        <small>Inativo</small>
      </button>
    </div>
  );
}

export default function WatchPartyControls(props: WatchPartyControlsProps) {
  return WATCH_PARTY_ENABLED
    ? <ActiveWatchPartyControls {...props} />
    : <UnavailableWatchPartyControls {...props} />;
}
