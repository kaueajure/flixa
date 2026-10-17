"use client";

import { useEffect, useRef, useState } from "react";
import VerticalVideo from "./miniseries-video";
import PlayerServerMenu from "./player-server-menu";
import { jsonRequest } from "./miniseries-request";
import type { Episode, Playback, TitleDetail } from "../lib/miniseries/types";

export default function MiniEpisodes({ detail }: { detail: TitleDetail }) {
  const available = detail.sources.filter((s) => s.episodesAvailable ?? s.available);
  const [source, setSource] = useState("");
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [selectedKey, setSelectedKey] = useState("");
  const [media, setMedia] = useState<Playback | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [episodesLoading, setEpisodesLoading] = useState(false);
  const [retryEpisodes, setRetryEpisodes] = useState(0);
  const sequence = useRef(0);
  const selected = episodes.find((e) => e.key === selectedKey);
  useEffect(() => {
    if (!source) return;
    const controller = new AbortController();
    jsonRequest<{ episodes: Episode[] }>(`/api/miniseries/episodes?id=${encodeURIComponent(detail.title.id)}&source=${encodeURIComponent(source)}`, { signal: controller.signal })
      .then((r) => { if (!controller.signal.aborted) { setEpisodes(r.episodes); setSelectedKey((key) => r.episodes.some((e) => e.key === key && e.available) ? key : ""); } })
      .catch((e) => { if (!controller.signal.aborted) setError(e.message); })
      .finally(() => { if (!controller.signal.aborted) setEpisodesLoading(false); });
    return () => controller.abort();
  }, [source, detail.title.id, retryEpisodes]);
  useEffect(() => () => { sequence.current++; }, []);
  function chooseSource(key: string) {
    if (key === source) return;
    sequence.current++; setSource(key); setMedia(null); setEpisodes([]); setError(""); setBusy(false); setEpisodesLoading(true);
  }
  async function play() {
    if (!selected || !selected.available || !detail.sources.find((s) => s.key === source)?.available || busy) return;
    const seq = ++sequence.current;
    setBusy(true); setError(""); setMedia(null);
    try {
      const r = await jsonRequest<Playback>("/api/miniseries/play", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: detail.title.id, source, episode: selected.id }) });
      if (seq === sequence.current) setMedia(r);
    } catch (e) { if (seq === sequence.current) setError(e instanceof Error ? e.message : "Não foi possível iniciar este episódio."); }
    finally { if (seq === sequence.current) setBusy(false); }
  }
  return <section className="mini-episodes" aria-label="Episódios e fontes">
    <div className="mini-source-heading"><h2>Episódios</h2>{source ? <PlayerServerMenu sources={available.map((s) => ({ id: s.key, name: s.name, theme: "red" }))} activeId={source} onSelect={chooseSource} /> : available.map((s) => <button className="secondary-action" key={s.key} type="button" onClick={() => chooseSource(s.key)}>Ver episódios · {s.name}</button>)}</div>
    {!available.length ? <p className="mini-notice">A reprodução nesta página ainda não está disponível. {detail.title.originals.length ? "Use os links acima para assistir na plataforma original." : "Nenhum link oficial verificado está disponível para este título."}</p> : null}
    {detail.sources.some((s) => !s.available) ? <details className="mini-source-status"><summary>Sobre as fontes deste título</summary>{detail.sources.filter((s) => !s.available).map((s) => <p key={s.key}><strong>{s.name}</strong> · {s.reason}</p>)}</details> : null}
    {source && !detail.sources.find((s) => s.key === source)?.available ? <p className="mini-notice">{detail.sources.find((s) => s.key === source)?.reason}</p> : null}
    {episodesLoading ? <p role="status">Carregando episódios…</p> : null}
    {error ? <div className="mini-notice" role="alert"><p>{error}</p>{!episodes.length && source ? <button className="secondary-action" type="button" onClick={() => { setError(""); setEpisodesLoading(true); setRetryEpisodes((n) => n + 1); }}>Tentar carregar episódios</button> : null}</div> : null}
    {source && !episodesLoading && !episodes.length && !error ? <p>Nenhum episódio disponível nesta fonte.</p> : null}
    {episodes.length ? <div className="mini-watch-layout"><div>
      <p className="mini-source-help">Selecione um episódio desta fonte. Ao trocar de servidor, a seleção só é mantida quando há uma correspondência verificada.</p>
      <div className="mini-episode-grid">{episodes.map((e) => <button type="button" key={e.id} disabled={!e.available || busy} aria-pressed={selectedKey === e.key} onClick={() => { sequence.current++; setSelectedKey(e.key); setMedia(null); setError(""); }} title={e.title || `Episódio ${e.number || e.id}`}>{e.number || e.id}{!e.available ? " · indisponível" : ""}</button>)}</div>
      {selected ? <button type="button" className="primary-action" disabled={busy || !detail.sources.find((s) => s.key === source)?.available} onClick={play}>{busy ? "Preparando episódio…" : `Iniciar episódio ${selected.number || selected.id}`}</button> : <p>Escolha um episódio para começar.</p>}
    </div><div className="mini-vertical-player">{media ? <VerticalVideo key={media.url} media={media} /> : <div className="mini-player-placeholder"><span aria-hidden="true">▷</span><p>Seu próximo capítulo começa aqui.</p></div>}</div></div> : null}
  </section>;
}


