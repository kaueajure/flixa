"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Movie = {
  id: string;
  source?: string;
  title: string;
  description?: string;
  poster: string;
  backdrop: string;
  videoUrl?: string;
  duration?: string;
  durationSeconds?: number;
  year?: number;
  genres: string[];
  rating?: string;
  director?: string;
  cast?: string[];
  trailer?: string;
  progress?: number;
};

function movieMeta(movie: Movie) {
  return [
    movie.year,
    movie.duration,
    movie.genres.join(" / "),
    movie.rating,
  ].filter((item) => item != null && String(item).trim() !== "");
}

function canWatch(movie: Movie) {
  return Boolean(movie.videoUrl || movie.trailer);
}

function getStoredIds(key: string) {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(key) ?? "[]") as string[];
  } catch {
    return [];
  }
}

function getStoredProgress(moviesList: Movie[]) {
  if (typeof window === "undefined") return {};
  return moviesList.reduce<Record<string, number>>((acc, movie) => {
    const value = Number(window.localStorage.getItem(`flixa-progress-${movie.id}`));
    if (Number.isFinite(value) && value > 0) acc[movie.id] = value;
    return acc;
  }, {});
}

function formatClock(seconds: number) {
  if (!Number.isFinite(seconds)) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${rest}`;
}

export default function Home() {
  const [movies, setMovies] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(true);
  const [scrolled, setScrolled] = useState(false);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
  const [playerMovie, setPlayerMovie] = useState<Movie | null>(null);
  const [listIds, setListIds] = useState<string[]>([]);
  const [savedProgress, setSavedProgress] = useState<Record<string, number>>({});

  useEffect(() => {
    async function fetchCatalog() {
      try {
        const res = await fetch("/api/movies", { cache: "no-store" });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const data = (await res.json()) as { movies?: Movie[] };
        setMovies(Array.isArray(data.movies) ? data.movies : []);
      } catch {
        setMovies([]);
      } finally {
        setLoading(false);
      }
    }

    fetchCatalog();
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll);

    return () => {
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  useEffect(() => {
    if (movies.length > 0) {
      setListIds(getStoredIds("flixa-list"));
      setSavedProgress(getStoredProgress(movies));
    }
  }, [movies]);

  useEffect(() => {
    if (!loading) {
      window.localStorage.setItem("flixa-list", JSON.stringify(listIds));
    }
  }, [listIds, loading]);

  const featuredMovie = movies.length > 0 ? movies[0] : null;

  const continueMovies = useMemo(
    () =>
      movies.filter((movie) => {
        const stored = savedProgress[movie.id];
        return movie.progress || (stored && stored > 0);
      }),
    [movies, savedProgress],
  );

  const listMovies = movies.filter((movie) => listIds.includes(movie.id));

  const apiRows = Array.from(
    new Set(movies.map((movie) => movie.source).filter((source): source is string => Boolean(source))),
  ).map((source) => ({
    title: `Catálogo ${source}`,
    items: movies.filter((movie) => movie.source === source),
  }));

  const rows = [
    { title: "Lançamentos Multi-Servidor", items: movies.slice(0, 12) },
    ...apiRows,
    ...(continueMovies.length ? [{ title: "Continue assistindo", items: continueMovies }] : []),
    ...(listMovies.length ? [{ title: "Minha lista", items: listMovies }] : []),
  ].filter((row) => row.items.length > 0);

  const searchResults = movies.filter((movie) => {
    const value = `${movie.title} ${movie.genres.join(" ")}`.toLowerCase();
    return value.includes(query.trim().toLowerCase());
  });

  const toggleList = (movieId: string) => {
    setListIds((current) =>
      current.includes(movieId)
        ? current.filter((id) => id !== movieId)
        : [...current, movieId],
    );
  };

  const openPlayer = (movie: Movie) => {
    setSelectedMovie(null);
    setPlayerMovie(movie);
  };

  if (loading) {
    return (
      <main className="flixa-shell" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", color: "white" }}>
        <p style={{ fontSize: "1.2rem", fontWeight: "bold" }}>Conectando aos servidores...</p>
        <p style={{ fontSize: "0.9rem", color: "#888", marginTop: "8px" }}>Buscando filmes e notas. Pode levar alguns segundos.</p>
      </main>
    );
  }

  return (
    <main className="flixa-shell">
      <header className={`flixa-header ${scrolled ? "is-scrolled" : ""}`}>
        <a className="brand" href="#home" aria-label="Flixa inicio">
          <span className="brand-mark" />
          <span>FLIXA</span>
        </a>

        <nav className="nav-links" aria-label="Navegacao principal">
          <a href="#home">Inicio</a>
          <a href="#filmes">Filmes</a>
          <a href="#minha-lista">Minha Lista</a>
        </nav>

        <div className="header-actions">
          <button
            className={`search-trigger ${searchOpen ? "is-active" : ""}`}
            type="button"
            aria-label="Abrir busca"
            onClick={() => {
              setSearchOpen((value) => !value);
              setQuery("");
            }}
          >
            <span />
          </button>
          <button className="avatar" type="button" aria-label="Perfil">
            F
          </button>
        </div>

        {searchOpen ? (
          <div className="search-panel">
            <input
              autoFocus
              aria-label="Buscar filmes"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar por titulo ou genero"
            />
            <div className="search-results">
              {query.trim() && searchResults.length === 0 ? (
                <p>Nenhum filme encontrado.</p>
              ) : null}
              {query.trim()
                ? searchResults.map((movie) => (
                    <button
                      className="search-result"
                      key={movie.id}
                      type="button"
                      onClick={() => {
                        setSelectedMovie(movie);
                        setSearchOpen(false);
                      }}
                    >
                      <span className="mini-poster" style={{ background: movie.poster, backgroundSize: "cover", backgroundPosition: "center" }} />
                      <span>
                        <strong>{movie.title}</strong>
                        <small>{[movie.year, movie.genres[0]].filter(Boolean).join(" / ")}</small>
                      </span>
                    </button>
                  ))
                : null}
            </div>
          </div>
        ) : null}
      </header>

      {featuredMovie ? (
        <section
          className="hero"
          id="home"
          style={{ "--hero-art": featuredMovie.backdrop, backgroundSize: "cover", backgroundPosition: "center" } as React.CSSProperties}
        >
          <div className="frame-strips" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <div className="hero-content">
            <p className="eyebrow">Em destaque na Flixa</p>
            <h1>{featuredMovie.title}</h1>
            {featuredMovie.description ? <p className="hero-description">{featuredMovie.description}</p> : null}
            <div className="meta-line">
              {movieMeta(featuredMovie).map((item) => (
                <span key={String(item)}>{item}</span>
              ))}
            </div>
            <div className="hero-actions">
              {canWatch(featuredMovie) ? (
                <button className="primary-action" type="button" onClick={() => openPlayer(featuredMovie)}>
                  Assistir
                </button>
              ) : null}
              <button
                className="secondary-action"
                type="button"
                onClick={() => toggleList(featuredMovie.id)}
              >
                {listIds.includes(featuredMovie.id) ? "Na Minha Lista" : "+ Minha Lista"}
              </button>
            </div>
          </div>
        </section>
      ) : (
        <section className="hero" id="home">
          <div className="hero-content">
            <p className="eyebrow">Catálogo Flixa</p>
            <h1>Nenhum filme retornado</h1>
            <p className="hero-description">As APIs não devolveram títulos neste momento.</p>
          </div>
        </section>
      )}

      <section className="content-rows" id="filmes" aria-label="Catalogo de filmes">
        {rows.map((row) => (
          <MovieRow
            key={row.title}
            title={row.title}
            items={row.items}
            progress={savedProgress}
            onOpen={setSelectedMovie}
          />
        ))}

        <section className="my-list-panel" id="minha-lista">
          <h2>Minha Lista</h2>
          {listMovies.length ? (
            <div className="compact-grid">
              {listMovies.map((movie) => (
                <MovieCard
                  key={movie.id}
                  movie={movie}
                  progress={savedProgress[movie.id] || movie.progress || 0}
                  onOpen={setSelectedMovie}
                />
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <p>Sua lista esta vazia.</p>
              <span>Explore os filmes e salve o que quiser assistir depois.</span>
            </div>
          )}
        </section>
      </section>

      {selectedMovie ? (
        <MovieDetails
          movie={selectedMovie}
          inList={listIds.includes(selectedMovie.id)}
          onClose={() => setSelectedMovie(null)}
          onToggleList={() => toggleList(selectedMovie.id)}
          onWatch={() => openPlayer(selectedMovie)}
        />
      ) : null}

      {playerMovie ? (
        <MoviePlayer
          movie={playerMovie}
          initialTime={savedProgress[playerMovie.id] ?? 0}
          onClose={(time) => {
            setSavedProgress((current) => ({ ...current, [playerMovie.id]: time }));
            window.localStorage.setItem(`flixa-progress-${playerMovie.id}`, String(time));
            setPlayerMovie(null);
          }}
        />
      ) : null}
    </main>
  );
}

function MovieRow({
  title,
  items,
  progress,
  onOpen,
}: {
  title: string;
  items: Movie[];
  progress: Record<string, number>;
  onOpen: (movie: Movie) => void;
}) {
  return (
    <section className="movie-row">
      <h2>{title}</h2>
      <div className="rail">
        {items.map((movie) => (
          <MovieCard
            key={movie.id}
            movie={movie}
            progress={progress[movie.id] || movie.progress || 0}
            onOpen={onOpen}
          />
        ))}
      </div>
    </section>
  );
}

function MovieCard({
  movie,
  progress,
  onOpen,
}: {
  movie: Movie;
  progress: number;
  onOpen: (movie: Movie) => void;
}) {
  return (
    <button className="movie-card" type="button" onClick={() => onOpen(movie)}>
      <span className="poster-art" style={{ background: movie.poster, backgroundSize: "cover", backgroundPosition: "center" }}>
        <span className="poster-grain" />
        <span className="poster-title">{movie.title}</span>
        {progress ? <span className="progress-bar" style={{ width: `${progress}%` }} /> : null}
      </span>
      <span className="card-meta">
        <strong>{movie.title}</strong>
        <small>{[movie.duration, movie.genres[0]].filter(Boolean).join(" / ")}</small>
      </span>
    </button>
  );
}

function MovieDetails({
  movie,
  inList,
  onClose,
  onToggleList,
  onWatch,
}: {
  movie: Movie;
  inList: boolean;
  onClose: () => void;
  onToggleList: () => void;
  onWatch: () => void;
}) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={movie.title}>
      <div className="details-panel">
        <button className="close-button" type="button" onClick={onClose} aria-label="Fechar">
          x
        </button>
        <div className="details-art" style={{ background: movie.backdrop, backgroundSize: "cover", backgroundPosition: "center" }} />
        <div className="details-body">
          <div className="details-poster" style={{ background: movie.poster, backgroundSize: "cover", backgroundPosition: "center" }} />
          <div className="details-copy">
            <p className="eyebrow">Filme Flixa</p>
            <h2>{movie.title}</h2>
            <div className="meta-line">
              {movieMeta(movie).map((item) => (
                <span key={String(item)}>{item}</span>
              ))}
            </div>
            {movie.description ? <p>{movie.description}</p> : null}
            <div className="details-actions">
              {canWatch(movie) ? (
                <button className="primary-action" type="button" onClick={onWatch}>
                  Assistir agora
                </button>
              ) : null}
              <button className="secondary-action" type="button" onClick={onToggleList}>
                {inList ? "Na Minha Lista" : "Minha Lista"}
              </button>
            </div>
            <div className="credits">
              {movie.director ? (
                <span>
                  <strong>Direcao</strong> {movie.director}
                </span>
              ) : null}
              {movie.cast?.length ? (
                <span>
                  <strong>Elenco</strong> {movie.cast.join(", ")}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MoviePlayer({
  movie,
  initialTime,
  onClose,
}: {
  movie: Movie;
  initialTime: number;
  onClose: (time: number) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(0.84);
  const [speed, setSpeed] = useState(1);
  const [controlsVisible, setControlsVisible] = useState(true);
  const progressPercent = duration ? (currentTime / duration) * 100 : 0;

  const showControls = () => {
    setControlsVisible(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (!videoRef.current?.paused) setControlsVisible(false);
    }, 2400);
  };

  useEffect(() => {
    hideTimer.current = setTimeout(() => {
      if (!videoRef.current?.paused) setControlsVisible(false);
    }, 2400);

    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!videoRef.current) return;
    videoRef.current.volume = volume;
  }, [volume]);

  useEffect(() => {
    if (!videoRef.current) return;
    videoRef.current.playbackRate = speed;
  }, [speed]);

  const togglePlay = async () => {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      await video.play();
      setPlaying(true);
    } else {
      video.pause();
      setPlaying(false);
    }

    showControls();
  };

  const closePlayer = () => {
    const video = videoRef.current;
    onClose(video?.currentTime ?? currentTime);
  };

  return (
    <div
      className={`player-view ${controlsVisible ? "show-controls" : ""}`}
      ref={wrapperRef}
      onMouseMove={showControls}
      onTouchStart={showControls}
    >
      {movie.videoUrl ? (
        <video
          ref={videoRef}
          className="video-stage"
          src={movie.videoUrl}
          preload="metadata"
          onLoadedMetadata={(event) => {
            const video = event.currentTarget;
            setDuration(video.duration);
            if (initialTime > 0 && initialTime < video.duration - 12) {
              video.currentTime = initialTime;
            }
          }}
          onTimeUpdate={(event) => {
            const time = event.currentTarget.currentTime;
            setCurrentTime(time);
          }}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
        />
      ) : movie.trailer ? (
        <iframe
          className="video-stage"
          src={movie.trailer}
          title={movie.title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      ) : (
        <div className="video-stage" style={{ display: "grid", placeItems: "center", color: "white" }}>
          <p>A API não enviou um vídeo para este título.</p>
        </div>
      )}

      <div className="player-shade" />
      <button className="back-button" type="button" onClick={closePlayer}>
        Voltar
      </button>

      <div className="player-controls">
        <div className="now-playing">
          <span>Assistindo</span>
          <strong>{movie.title}</strong>
        </div>
        <input
          className="timeline"
          aria-label="Progresso do video"
          type="range"
          min="0"
          max={duration || 0}
          value={currentTime}
          style={{ "--progress": `${progressPercent}%` } as React.CSSProperties}
          onChange={(event) => {
            const value = Number(event.target.value);
            if (videoRef.current) videoRef.current.currentTime = value;
            setCurrentTime(value);
          }}
        />
        <div className="control-row">
          <button type="button" onClick={togglePlay}>
            {playing ? "Pausar" : "Play"}
          </button>
          <span className="time-code">
            {formatClock(currentTime)} / {formatClock(duration)}
          </span>
          <label className="volume-control">
            Volume
            <input
              aria-label="Volume"
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={volume}
              onChange={(event) => setVolume(Number(event.target.value))}
            />
          </label>
          <label className="speed-control">
            Velocidade
            <select value={speed} onChange={(event) => setSpeed(Number(event.target.value))}>
              <option value={0.75}>0.75x</option>
              <option value={1}>1x</option>
              <option value={1.25}>1.25x</option>
              <option value={1.5}>1.5x</option>
            </select>
          </label>
          <button
            type="button"
            onClick={() => wrapperRef.current?.requestFullscreen?.()}
          >
            Fullscreen
          </button>
        </div>
      </div>
    </div>
  );
}