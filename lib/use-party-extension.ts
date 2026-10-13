"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createClientId } from "./client-id";
export type ExtensionPlaybackEvent = { name: string; currentTime: number; duration: number; paused: boolean; command: string; result?: unknown };
type ExtensionOptions = { sourceUrl?: string; providerId?: string; role?: "host" | "guest" | "preview"; roomCode?: string };
export function usePartyExtension({ sourceUrl = "", providerId = "", role = "preview", roomCode = "" }: ExtensionOptions = {}) {
  const [installed, setInstalled] = useState(false);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState("Conecte a extensão nesta aba do Flixa.");
  const [playback, setPlayback] = useState<{ currentTime: number; duration: number } | null>(null);
  const lastPlayback = useRef(0);
  const [version, setVersion] = useState("");
  const channel = useRef(""); const options = useRef({ sourceUrl, providerId, role, roomCode });
  const lastPong = useRef(0); const pending = useRef(new Map<string, { resolve: (data: Record<string, unknown>) => void; timer: number }>());
  useEffect(() => { options.current = { sourceUrl, providerId, role, roomCode }; }, [sourceUrl, providerId, role, roomCode]);
  const request = useCallback((action: string, payload: Record<string, unknown> = {}) => {
    if (!channel.current) return Promise.resolve({ error: "Extensão não conectada." } as Record<string, unknown>);
    const requestId = createClientId();
    return new Promise<Record<string, unknown>>(resolve => {
      const timer = window.setTimeout(() => { pending.current.delete(requestId); resolve({ error: "A extensão não respondeu. Conecte-a nesta aba." }); }, action === "command" ? 10_000 : 2500);
      pending.current.set(requestId, { resolve, timer });
      window.postMessage({ type: "flixa-group:site", channel: channel.current, requestId, action, ...payload }, location.origin);
    });
  }, []);
  const parseEvent = useCallback((event: MessageEvent) => {
    if (event.source !== window || event.origin !== location.origin || event.data?.type !== "flixa-group:extension" || event.data.channel !== channel.current) return null;
    if (event.data.sourceUrl !== options.current.sourceUrl) return null;
    const value = event.data.playback;
    if (event.data.kind === "host-command") return { hostCommand: event.data.command as string, time: event.data.time as number };
    if (event.data.kind !== "playback" || !value || !Number.isFinite(value.currentTime) || !Number.isFinite(value.duration) || value.duration < 600 || typeof value.paused !== "boolean") return null;
    return { name: String(event.data.event || "timeupdate"), currentTime: value.currentTime, duration: value.duration, paused: value.paused || Boolean(value.buffering), command: "", result: undefined };
  }, []);
  useEffect(() => {
    channel.current = createClientId(); const queue = pending.current;
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window || event.origin !== location.origin || event.data?.type !== "flixa-group:extension" || event.data.channel !== channel.current) return;
      const data = event.data;
      if (data.kind === "response") {
        const waiting = queue.get(data.requestId); if (waiting) { clearTimeout(waiting.timer); queue.delete(data.requestId); waiting.resolve(data); }
        if (data.installed) { lastPong.current = Date.now(); setInstalled(true); setVersion(String(data.version)); }
      }
      if (data.kind === "disconnected") { setInstalled(false); setReady(false); lastPong.current = 0; setStatus("Extensão desconectada nesta aba."); }
      if (data.kind === "playback" && data.sourceUrl === options.current.sourceUrl) {
        const video = data.playback; lastPlayback.current = Date.now();
        if (video && Number.isFinite(video.currentTime) && Number.isFinite(video.duration)) setPlayback({ currentTime: video.currentTime, duration: video.duration });
        setReady(Boolean(video && video.ready >= 2 && video.duration >= 600 && !video.error));
        setStatus(video?.error || (video?.buffering ? "Vídeo carregando…" : video?.ready >= 2 && video?.duration >= 600 ? "Vídeo detectado · pronto para sincronizar" : "Inicie o vídeo para sincronizar."));
      }
    };
    window.addEventListener("message", onMessage);
    const ping = () => {
      void request("ping");
      if (options.current.sourceUrl && Date.now() - lastPlayback.current > 6000) { setReady(false); setStatus("Aguardando um vídeo pronto no servidor selecionado."); }
      if (lastPong.current && Date.now() - lastPong.current > 7000) { setInstalled(false); setReady(false); setStatus("Extensão desconectada. Reconecte-a nesta aba."); }
    };
    ping(); const timer = window.setInterval(ping, 3000);
    return () => {
      window.clearInterval(timer); window.removeEventListener("message", onMessage);
      void request("release");
      for (const waiting of queue.values()) { clearTimeout(waiting.timer); waiting.resolve({ error: "Player fechado." }); } queue.clear();
      channel.current = "";
    };
  }, [request]);
  useEffect(() => {
    if (!installed || !sourceUrl || !providerId) return;
    let live = true;
    // Reset only when changing the source, not when promoting preview to host/guest.
    void request("bind", { sourceUrl, providerId, role, roomCode }).then(data => { if (live && data.error) setStatus(String(data.error)); });
    return () => { live = false; };
  }, [installed, sourceUrl, providerId, role, roomCode, request]);
  useEffect(() => { queueMicrotask(() => { setReady(false); setPlayback(null); lastPlayback.current = 0; setStatus("Inicie o vídeo para a extensão detectá-lo."); }); }, [sourceUrl]);
  const command = useCallback((name: "play" | "pause" | "seek" | "getStatus", time?: number) => {
    void request("command", { command: name, time }).then(data => { if (data.error) setStatus(String(data.error)); });
  }, [request]);
  return { installed, ready, status, version, playback, command, parseEvent };
}
