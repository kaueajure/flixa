"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Playback } from "../lib/miniseries/types";

export default function VerticalVideo({ media }: { media: Playback }) {
  const [quality, setQuality] = useState(-1);
  const selectedMedia = useMemo(() => {
    const selected = media.qualities?.[quality];
    return !selected ? media : { ...media, ...selected, format: new URL(selected.url).pathname.toLowerCase().endsWith(".m3u8") ? "hls" as const : "mp4" as const };
  }, [media, quality]);
  const position = useRef(0);
  const hlsRef = useRef<import("hls.js").default | null>(null);
  const [levels, setLevels] = useState<{ height: number; bitrate: number }[]>([]);
  const [level, setLevel] = useState(-1);
  const ref = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    let disposed = false; let destroy: (() => void) | undefined;
    const expires = window.setTimeout(() => { video.pause(); video.removeAttribute("src"); video.load(); destroy?.(); setError("O link deste episódio expirou. Inicie o episódio novamente para continuar."); }, Math.max(0, selectedMedia.expiresAt - Date.now()));
    if ((selectedMedia.format === "hls" || new URL(selectedMedia.url).pathname.toLowerCase().endsWith(".m3u8")) && !video.canPlayType("application/vnd.apple.mpegurl")) {
      import("hls.js").then(({ default: Hls }) => {
        if (disposed) return;
        if (!Hls.isSupported()) { setError("Este navegador não suporta o formato do vídeo."); return; }
        const hls = new Hls(); hlsRef.current = hls; destroy = () => { hls.destroy(); hlsRef.current = null; };
        hls.on(Hls.Events.MANIFEST_PARSED, () => { if (!disposed) { setLevels(hls.levels.map((l) => ({ height: l.height, bitrate: l.bitrate }))); setLevel(-1); } });
        hls.loadSource(selectedMedia.url); hls.attachMedia(video);
        hls.on(Hls.Events.ERROR, (_event, data) => { if (data.fatal) setError("Falha de rede, CORS ou mídia indisponível. Tente iniciar o episódio novamente."); });
      }).catch(() => { if (!disposed) setError("Não foi possível carregar o player."); });
    } else video.src = selectedMedia.url;
    return () => { disposed = true; position.current = video.currentTime; window.clearTimeout(expires); destroy?.(); video.pause(); video.removeAttribute("src"); video.load(); };
  }, [selectedMedia]);
  return <>{media.qualities?.length ? <label>Qualidade<select value={quality} onChange={(e) => { setError(""); setQuality(Number(e.target.value)); }}><option value={-1}>Original / automática</option>{media.qualities.map((q, i) => <option key={i} value={i}>{q.label}</option>)}</select></label> : null}{levels.length > 1 ? <label>Qualidade HLS<select value={level} onChange={(e) => { const n = Number(e.target.value); setLevel(n); if (hlsRef.current) hlsRef.current.currentLevel = n; }}><option value={-1}>Automática</option>{levels.map((l, i) => <option key={i} value={i}>{l.height ? `${l.height}p` : `${Math.round(l.bitrate / 1000)} kbps`}</option>)}</select></label> : null}{error ? <p role="alert">{error}</p> : null}<video ref={ref} controls autoPlay playsInline onLoadedMetadata={() => { if (ref.current && position.current > 0) ref.current.currentTime = position.current; }} preload="none" aria-label="Player vertical da minissérie" onError={() => setError("Vídeo indisponível. Tente iniciar o episódio novamente.")}>{media.subtitles.map((s) => <track key={s.lang} kind="subtitles" src={s.url} srcLang={s.lang} label={s.label} default={s.default} />)}</video></>;
}

