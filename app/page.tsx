"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Movie = {
  id: string;
  title: string;
  description: string;
  poster: string;
  backdrop: string;
  videoUrl: string;
  duration: string;
  durationSeconds: number;
  year: number;
  genres: string[];
  rating: string;
  director?: string;
  cast?: string[];
  trailer?: string;
  progress?: number;
};

// ==========================================
// ⚙️ CONFIGURAÇÕES DAS APIs
// Atenção: Substitua a propriedade 'url' pelo "Request URL" exato do playground de cada API!
// ==========================================
const API_SOURCES = [
  { 
    name: "YTS", 
    host: "yts-am-torrent.p.rapidapi.com", 
    url: "https://yts-am-torrent.p.rapidapi.com/list_movies.json?limit=15&sort_by=download_count" 
  },
  { 
    name: "EasyTorrents", 
    host: "easytorrents1.p.rapidapi.com", 
    url: "https://easytorrents1.p.rapidapi.com/search?q=movie" 
  },
  { 
    name: "MovieTVMusic", 
    host: "movie-tv-music-search-and-download.p.rapidapi.com", 
    url: "https://movie-tv-music-search-and-download.p.rapidapi.com/search?q=movie" 
  },
  { 
    name: "AmazonVideo", 
    host: "amazon-video-mp4.p.rapidapi.com", 
    url: "https://amazon-video-mp4.p.rapidapi.com/search?q=movie" 
  },
  { 
    name: "MovieDatabase", 
    host: "movie-database-api1.p.rapidapi.com", 
    url: "https://movie-database-api1.p.rapidapi.com/movies" 
  },
  { 
    name: "StreamMovies", 
    host: "stream-movies.p.rapidapi.com", 
    url: "https://stream-movies.p.rapidapi.com/movies" 
  },
  { 
    name: "CineStream", 
    host: "cinestream-api.p.rapidapi.com", 
    url: "https://cinestream-api.p.rapidapi.com/movies" 
  }
];

// Filmes originais salvos como plano B caso todas as APIs falhem
const fallbackMovies: Movie[] = [
  {
    id: "noite-de-vidro",
    title: "Noite de Vidro",
    description:
      "Uma restauradora de arquivos encontra imagens apagadas de um crime dentro do predio mais vigiado da cidade.",
    poster:
      "linear-gradient(160deg, rgba(8,12,16,.3), rgba(8,12,16,.76)), radial-gradient(circle at 62% 18%, rgba(226,244,255,.72), transparent 21%), linear-gradient(135deg, #0d1117 0%, #152b34 47%, #030506 100%)",
    backdrop: "url('/assets/noite-de-vidro-backdrop.png')",
    videoUrl:
      "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
    duration: "1h 42min",
    durationSeconds: 6120,
    year: 2026,
    genres: ["Suspense", "Drama"],
    rating: "14",
    director: "Lia Monte",
    cast: ["Nina Reis", "Caio Varella", "Otto Prado"],
    progress: 34,
  },
  {
    id: "mare-zero",
    title: "Mare Zero",
    description:
      "Depois que o mar desaparece por uma noite, uma equipe precisa atravessar a costa antes que tudo volte ao lugar.",
    poster: "url('/assets/mare-zero-poster.png')",
    backdrop:
      "radial-gradient(circle at 44% 22%, rgba(202,233,255,.28), transparent 17%), linear-gradient(120deg, #03080d 0%, #14334a 50%, #020303 100%)",
    videoUrl:
      "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4",
    duration: "1h 58min",
    durationSeconds: 7080,
    year: 2025,
    genres: ["Aventura", "Misterio"],
    rating: "12",
    director: "Bruno Sato",
    cast: ["Maya Costa", "Theo Brandao"],
    progress: 12,
  },
  {
    id: "linha-final",
    title: "Linha Final",
    description:
      "Um editor de som recebe a ultima gravacao de uma atriz desaparecida e percebe que cada corte muda a historia.",
    poster:
      "radial-gradient(circle at 51% 26%, rgba(255,226,168,.34), transparent 15%), linear-gradient(135deg, rgba(3,3,4,.18), rgba(3,3,4,.88)), linear-gradient(145deg, #1d1210 0%, #553826 52%, #070404 100%)",
    backdrop:
      "radial-gradient(circle at 61% 33%, rgba(255,224,164,.24), transparent 18%), linear-gradient(112deg, #050303 0%, #21100d 37%, #68442c 72%, #050303 100%)",
    videoUrl:
      "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4",
    duration: "2h 04min",
    durationSeconds: 7440,
    year: 2024,
    genres: ["Crime", "Suspense"],
    rating: "16",
    director: "Ari Lopes",
    cast: ["Rafa Nunes", "Helena Diniz", "Ivo Lima"],
  },
  {
    id: "orbita-17",
    title: "Orbita 17",
    description:
      "A tripulacao de uma estacao esquecida decide transmitir o que viu antes que a Terra perca o sinal.",
    poster:
      "radial-gradient(circle at 48% 18%, rgba(232,244,255,.48), transparent 13%), radial-gradient(circle at 54% 47%, rgba(98,152,255,.22), transparent 19%), linear-gradient(150deg, #050710 0%, #121b33 54%, #020205 100%)",
    backdrop:
      "radial-gradient(circle at 62% 29%, rgba(216,236,255,.3), transparent 15%), radial-gradient(circle at 37% 52%, rgba(83,118,216,.24), transparent 20%), linear-gradient(118deg, #02030a 0%, #0d1530 62%, #010102 100%)",
    videoUrl:
      "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4",
    duration: "1h 49min",
    durationSeconds: 6540,
    year: 2026,
    genres: ["Ficcao", "Drama"],
    rating: "12",
    director: "Mila Araujo",
    cast: ["Davi Rocha", "Clara Farias"],
  },
  {
    id: "cidade-baixa",
    title: "Cidade Baixa",
    description:
      "Durante uma madrugada de queda de energia, tres entregadores cruzam bairros que nunca deveriam se encontrar.",
    poster:
      "radial-gradient(circle at 34% 18%, rgba(251,108,69,.28), transparent 17%), linear-gradient(150deg, rgba(5,4,4,.2), rgba(5,4,4,.9)), linear-gradient(135deg, #120706 0%, #40221e 48%, #090304 100%)",
    backdrop:
      "radial-gradient(circle at 30% 34%, rgba(241,86,48,.22), transparent 20%), linear-gradient(112deg, #030202 0%, #1b0d0c 42%, #4a241d 76%, #030202 100%)",
    videoUrl:
      "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
    duration: "1h 31min",
    durationSeconds: 5460,
    year: 2023,
    genres: ["Drama", "Urbano"],
    rating: "14",
    director: "Jonas Vale",
    cast: ["Lara Mota", "Gus Martins"],
    progress: 67,
  },
];

// Função inteligente que tenta mapear qualquer resposta de API para o nosso tipo Movie
function parseApiResponse(sourceName: string, data: any): Movie[] {
  let items: any[] = [];
  
  // Tenta encontrar a array de filmes em diversas estruturas comuns
  if (Array.isArray(data)) items = data;
  else if (Array.isArray(data?.data?.movies)) items = data.data.movies;
  else if (Array.isArray(data?.movies)) items = data.movies;
  else if (Array.isArray(data?.results)) items = data.results;
  else if (Array.isArray(data?.data)) items = data.data;

  return items.slice(0, 10).map((m: any, index: number) => {
    const rawImage = m.large_cover_image || m.poster_path || m.poster_url || m.poster || m.image;
    const rawBackdrop = m.background_image_original || m.backdrop_path || m.backdrop_url || m.backdrop || rawImage;

    return {
      id: `${sourceName.toLowerCase()}-${m.id || m.imdb_id || index}`,
      title: m.title || m.name || `Filme de ${sourceName}`,
      description: m.summary || m.synopsis || m.overview || m.description_full || m.description || "Sem descrição disponível.",
      poster: rawImage ? `url('${rawImage}')` : "none",
      backdrop: rawBackdrop ? `url('${rawBackdrop}')` : "none",
      videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
      duration: m.runtime ? `${Math.floor(m.runtime / 60)}h ${m.runtime % 60}min` : "2h 00min",
      durationSeconds: m.runtime ? m.runtime * 60 : 7200,
      year: m.year || (m.release_date ? new Date(m.release_date).getFullYear() : 2024),
      genres: m.genres || [sourceName],
      rating: String(m.rating || m.vote_average || "N/A"),
      director: "Desconhecido",
      cast: [],
      progress: 0,
    };
  });
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
  const [apiErrors, setApiErrors] = useState<string[]>([]);
  const [scrolled, setScrolled] = useState(false);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
  const [playerMovie, setPlayerMovie] = useState<Movie | null>(null);
  const [listIds, setListIds] = useState<string[]>([]);
  const [savedProgress, setSavedProgress] = useState<Record<string, number>>({});

  useEffect(() => {
    async function fetchAllApis() {
      const rapidApiKey = process.env.NEXT_PUBLIC_RAPIDAPI_KEY || "656bfca43amsh7408378f68fbc6ep1bbde0jsn06c38f0d1d28";
      let fetchedMovies: Movie[] = [];
      let tempErrors: string[] = [];

      // Dispara requisições para todas as APIs em paralelo
      const fetchPromises = API_SOURCES.map(async (api) => {
        try {
          const res = await fetch(api.url, {
            method: "GET",
            headers: {
              "x-rapidapi-key": rapidApiKey,
              "x-rapidapi-host": api.host,
            },
          });

          if (!res.ok) {
            tempErrors.push(`${api.name}: ${res.status}`);
            return [];
          }

          const data = await res.json();
          const parsedMovies = parseApiResponse(api.name, data);
          
          if (parsedMovies.length === 0) {
            tempErrors.push(`${api.name}: Sem dados/Rota incorreta`);
          }
          
          return parsedMovies;
        } catch (error) {
          tempErrors.push(`${api.name}: Falha Conexão`);
          return [];
        }
      });

      // Aguarda todas as requisições terminarem
      const results = await Promise.all(fetchPromises);
      fetchedMovies = results.flat();

      if (fetchedMovies.length > 0) {
        setMovies(fetchedMovies);
      } else {
        // Se todas falharem, carrega os filmes de fallback
        setMovies(fallbackMovies);
        tempErrors.push("Exibindo catálogo offline.");
      }

      setApiErrors(tempErrors);
      setLoading(false);
    }

    fetchAllApis();
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

  // Agrupa os filmes por suas respectivas APIs para montar as fileiras (rows)
  const rows = [
    { title: "Lançamentos (Destaque)", items: movies.slice(0, 10) },
    ...API_SOURCES.map(api => ({
      title: `Catálogo ${api.name}`,
      items: movies.filter(m => m.id.startsWith(api.name.toLowerCase()))
    })).filter(row => row.items.length > 0),
    ...(continueMovies.length ? [{ title: "Continue assistindo", items: continueMovies }] : []),
    ...(listMovies.length ? [{ title: "Minha lista", items: listMovies }] : []),
  ];

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
      <main className="flixa-shell" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", color: "white" }}>
        <p>Buscando catálogo de múltiplos servidores...</p>
      </main>
    );
  }

  if (!featuredMovie) {
    return (
      <main className="flixa-shell" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", color: "white" }}>
        <p>Erro crasso. Nenhum filme disponível.</p>
      </main>
    );
  }

  return (
    <main className="flixa-shell">
      {apiErrors.length > 0 && (
        <div style={{ background: '#eab308', color: '#000', padding: '10px', textAlign: 'center', fontSize: '13px', fontWeight: 'bold', zIndex: 9999, position: 'relative' }}>
          Alertas de API: {apiErrors.join(" | ")}
        </div>
      )}

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
                        <small>
                          {movie.year} / {movie.genres[0]}
                        </small>
                      </span>
                    </button>
                  ))
                : null}
            </div>
          </div>
        ) : null}
      </header>

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
          <p className="hero-description">{featuredMovie.description}</p>
          <div className="meta-line">
            <span>{featuredMovie.year}</span>
            <span>{featuredMovie.duration}</span>
            <span>{featuredMovie.genres.join(" / ")}</span>
            <span>{featuredMovie.rating}</span>
          </div>
          <div className="hero-actions">
            <button className="primary-action" type="button" onClick={() => openPlayer(featuredMovie)}>
              Assistir
            </button>
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
        <small>
          {movie.duration} / {movie.genres[0]}
        </small>
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
              <span>{movie.year}</span>
              <span>{movie.duration}</span>
              <span>{movie.genres.join(" / ")}</span>
              <span>{movie.rating}</span>
            </div>
            <p>{movie.description}</p>
            <div className="details-actions">
              <button className="primary-action" type="button" onClick={onWatch}>
                Assistir agora
              </button>
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