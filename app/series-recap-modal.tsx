"use client";

import { useEffect, useRef, useState } from "react";

type RecapMovie = {
  tmdb_id?: string;
  id: string;
  title: string;
  description?: string;
  backdrop?: string;
  season?: number;
  episode?: number;
};

type EpisodeRecap = {
  episode_number: number;
  name: string;
  overview: string;
  still?: string;
};

export default function SeriesRecapModal({ movie, onContinue, onCancel }: { movie: RecapMovie; onContinue: () => void; onCancel: () => void }) {
  const season = Math.max(1, movie.season || 1);
  const episode = Math.max(1, movie.episode || 1);
  const recapSeason = episode > 1 ? season : Math.max(1, season - 1);
  const [episodes, setEpisodes] = useState<EpisodeRecap[]>([]);
  const [loading, setLoading] = useState(true);
  const continueRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    const id = movie.tmdb_id || movie.id.replace(/^tv-/, "");
    fetch(`/api/movies?id=${encodeURIComponent(id)}&kind=tv&season=${recapSeason}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => response.ok ? response.json() as Promise<{ episodes?: EpisodeRecap[] }> : { episodes: [] })
      .then((data) => {
        const available = Array.isArray(data.episodes) ? data.episodes : [];
        const previous = recapSeason === season ? available.filter((item) => item.episode_number < episode) : available;
        setEpisodes(previous.filter((item) => item.overview).slice(-3));
      })
      .catch(() => setEpisodes([]))
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [episode, movie.id, movie.tmdb_id, recapSeason, season]);

  useEffect(() => { continueRef.current?.focus(); }, []);

  return (
    <div className="recap-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
      <section className="recap-modal" role="dialog" aria-modal="true" aria-labelledby="recap-title">
        {movie.backdrop ? <img className="recap-hero" src={movie.backdrop} alt="" /> : null}
        <div className="recap-shade" />
        <div className="recap-content">
          <p className="eyebrow">Anteriormente em</p>
          <h2 id="recap-title">{movie.title}</h2>
          <span className="recap-next">Você vai continuar em T{season} E{episode}</span>
          <div className="recap-list">
            {loading ? <p>Preparando sua recapitulação…</p> : episodes.length ? episodes.map((item) => (
              <article key={item.episode_number}>
                {item.still ? <img src={item.still} alt="" /> : <b>E{item.episode_number}</b>}
                <div><small>T{recapSeason} E{item.episode_number}</small><strong>{item.name}</strong><p>{item.overview}</p></div>
              </article>
            )) : <p>{movie.description || "Não há um resumo disponível para os episódios anteriores."}</p>}
          </div>
          <div className="recap-actions">
            <button className="primary-action" ref={continueRef} type="button" onClick={onContinue}>Continuar T{season} E{episode}</button>
            <button className="secondary-action" type="button" onClick={onCancel}>Agora não</button>
          </div>
        </div>
      </section>
    </div>
  );
}
