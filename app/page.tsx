"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";

type MediaKind = "movie" | "tv";

type Movie = {
  id: string;
  source?: string;
  kind?: MediaKind;
  list?: string;
  imdb_id?: string;
  tmdb_id?: string;
  title: string;
  description?: string;
  poster: string;
  backdrop: string;
  duration?: string;
  year?: number;
  genres: string[];
  rating?: string;
  director?: string;
  cast?: string[];
  trailer?: string;
  progress?: number;
};

type Genre = { id: number; name: string };
type View = "home" | "filmes" | "series" | "lista" | "genero";
type AuthUser = {
  id: number;
  nome: string;
  email: string;
  administrador: boolean;
};

const LIST_KEY = "flixa-saved-movies";
const LEGACY_LIST_KEY = "flixa-list";
const RECENT_KEY = "flixa-recent";

function mediaKind(movie: Movie): MediaKind {
  return movie.kind === "tv" ? "tv" : "movie";
}

function movieKey(movie: Movie) {
  if (movie.kind === "tv") return `tv:${movie.tmdb_id || movie.id}`;
  return movie.tmdb_id || movie.imdb_id || movie.id;
}

function titleId(movie: Movie) {
  return movie.tmdb_id || movie.id.replace(/^(movie-|tv-)/, "");
}

function imageSrc(value?: string, size?: "w342" | "w780" | "w1280") {
  if (!value) return "";
  const nested = value.match(/url\(['"]?([^'")]+)['"]?\)/);
  const raw = nested?.[1] || value;
  if (!raw.startsWith("http://") && !raw.startsWith("https://")) return "";
  if (size) return raw.replace(/\/w\d+\//, `/${size}/`);
  return raw;
}

function formatScore(value?: string) {
  if (!value) return "";
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toFixed(1) : value;
}

function movieMeta(movie: Movie) {
  return [
    mediaKind(movie) === "tv" ? "Série" : "Filme",
    movie.year,
    movie.duration,
    movie.genres?.slice(0, 2).join(" · "),
    formatScore(movie.rating) || null,
  ].filter((item) => item != null && String(item).trim() !== "");
}

function canWatch(movie: Movie) {
  return Boolean(movie.imdb_id || movie.tmdb_id || (movie.id && /^(tt|movie-|tv-|\d)/.test(movie.id)));
}

function dedupeMovies(items: Movie[]) {
  const seen = new Set<string>();
  return items.filter((movie) => {
    const key = movieKey(movie);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function readJsonList(key: string): Movie[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) ?? "[]") as Movie[];
    return Array.isArray(parsed) ? parsed.filter((item) => item?.id && item?.title) : [];
  } catch {
    return [];
  }
}

function writeJsonList(key: string, movies: Movie[]) {
  window.localStorage.setItem(key, JSON.stringify(movies));
}

function isListed(list: Movie[], movie: Movie) {
  return list.some((item) => movieKey(item) === movieKey(movie));
}

function detailsHash(movie: Movie) {
  return mediaKind(movie) === "tv" ? `serie/${titleId(movie)}` : `filme/${titleId(movie)}`;
}

function playerHash(movie: Movie) {
  return `player/${detailsHash(movie)}`;
}

function catalogReturnHash(hash: string) {
  const route = parseRoute(hash);
  if (route.selected || route.player) return "home";
  return hash.replace(/^#/, "") || "home";
}

function parseRoute(hash: string) {
  const raw = hash.replace(/^#/, "");
  if (!raw || raw === "home") return { view: "home" as View };
  const catalog = raw.match(/^(filmes|series)(?:\/(\d+))?$/);
  if (catalog) {
    return {
      view: (catalog[1] === "series" ? "series" : "filmes") as View,
      catalogPage: Math.max(1, Number(catalog[2] || "1") || 1),
    };
  }
  if (raw === "minha-lista" || raw === "lista") return { view: "lista" as View };

  const genre = raw.match(/^genero\/(\d+)$/);
  if (genre) return { view: "genero" as View, genreId: genre[1] };

  const player = raw.match(/^player\/(filme|serie)\/([^/]+)$/);
  if (player) {
    return {
      view: "home" as View,
      player: { kind: (player[1] === "serie" ? "tv" : "movie") as MediaKind, id: player[2] },
    };
  }

  const title = raw.match(/^(filme|serie)\/([^/]+)$/);
  if (title) {
    return {
      view: "home" as View,
      selected: { kind: (title[1] === "serie" ? "tv" : "movie") as MediaKind, id: title[2] },
    };
  }

  return { view: "home" as View };
}

function useFocusTrap(active: boolean, ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!active || !ref.current) return;
    const root = ref.current;
    const focusable = () =>
      Array.from(
        root.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => el.offsetParent !== null || el === document.activeElement);

    const previous = document.activeElement as HTMLElement | null;
    focusable()[0]?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const items = focusable();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    root.addEventListener("keydown", onKey);
    return () => {
      root.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, [active, ref]);
}

export default function Home() {
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [movies, setMovies] = useState<Movie[]>([]);
  const [genres, setGenres] = useState<Genre[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
  const [playerMovie, setPlayerMovie] = useState<Movie | null>(null);
  const [listMovies, setListMovies] = useState<Movie[]>(() => readJsonList(LIST_KEY));
  const [recentMovies, setRecentMovies] = useState<Movie[]>(() => readJsonList(RECENT_KEY));
  const [remoteResults, setRemoteResults] = useState<Movie[]>([]);
  const [searching, setSearching] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [view, setView] = useState<View>("home");
  const [genreId, setGenreId] = useState<string | null>(null);
  const [genreItems, setGenreItems] = useState<Movie[]>([]);
  const [genrePage, setGenrePage] = useState(1);
  const [genreLoading, setGenreLoading] = useState(false);
  const [catalogPage, setCatalogPage] = useState(1);
  const [browseItems, setBrowseItems] = useState<Movie[]>([]);
  const [browseTotal, setBrowseTotal] = useState(0);
  const [browsePages, setBrowsePages] = useState(1);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [heroIndex, setHeroIndex] = useState(0);
  const [heroPaused, setHeroPaused] = useState(false);
  const toastTimer = useRef<number | null>(null);
  const lastCatalogHash = useRef("home");
  const playerMovieRef = useRef<Movie | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const searchPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    playerMovieRef.current = playerMovie;
  }, [playerMovie]);

  useFocusTrap(searchOpen, searchPanelRef);

  useEffect(() => {
    let ativo = true;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 12000);

    fetch("/api/auth/me", { cache: "no-store", signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) return null;
        const data = (await res.json()) as { usuario?: AuthUser | null };
        return data.usuario ?? null;
      })
      .then((usuario) => {
        if (!ativo) return;
        if (!usuario) {
          window.location.href = "/login";
          return;
        }
        setAuthUser(usuario);
        setAuthChecking(false);
      })
      .catch(() => {
        if (!ativo) return;
        window.location.href = "/login";
      })
      .finally(() => {
        window.clearTimeout(timeoutId);
      });
    return () => {
      ativo = false;
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, []);

  async function logout() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      window.location.href = "/login";
    }
  }

  function showToast(message: string) {
    setToast(message);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2200);
  }

  function fetchCatalog(showBoot = false) {
    if (showBoot) {
      setLoading(true);
      setLoadError(null);
    }
    fetch("/api/movies", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { movies?: Movie[]; genres?: Genre[] };
        const next = Array.isArray(data.movies) ? data.movies : [];
        setGenres(Array.isArray(data.genres) ? data.genres : []);
        if (next.length === 0) {
          setMovies([]);
          setLoadError("Nenhum título retornou da TMDB neste momento.");
          return;
        }
        setMovies(next);
      })
      .catch(() => {
        setMovies([]);
        setLoadError("Não foi possível carregar o catálogo.");
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (authChecking || !authUser) return;
    const boot = window.setTimeout(() => fetchCatalog(), 0);
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/adblock-sw.js")
        .then((reg) => reg.update())
        .catch(() => {});
    }
    return () => window.clearTimeout(boot);
  }, [authChecking, authUser]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  async function resolveTitle(id: string, kind: MediaKind) {
    const local = [...movies, ...listMovies, ...recentMovies].find(
      (item) => titleId(item) === id && mediaKind(item) === kind,
    );
    if (local) return local;
    const res = await fetch(`/api/movies?id=${encodeURIComponent(id)}&kind=${kind}`, { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as { movie?: Movie };
    return data.movie ?? null;
  }

  useEffect(() => {
    const syncView = () => {
      const route = parseRoute(window.location.hash);
      setView(route.view);
      setGenreId(route.genreId ?? null);
      setCatalogPage(route.catalogPage ?? 1);
      if (!route.selected && !route.player) {
        lastCatalogHash.current = window.location.hash.replace("#", "") || "home";
      }

      if (route.player) {
        void resolveTitle(route.player.id, route.player.kind).then((movie) => {
          if (!movie) return;
          setSelectedMovie(null);
          setPlayerMovie((current) =>
            current && titleId(current) === titleId(movie) && mediaKind(current) === mediaKind(movie)
              ? current
              : movie,
          );
        });
        return;
      }

      setPlayerMovie(null);
      if (route.selected) {
        void resolveTitle(route.selected.id, route.selected.kind).then((movie) => {
          if (!movie) return;
          setSelectedMovie((current) =>
            current && titleId(current) === titleId(movie) && mediaKind(current) === mediaKind(movie)
              ? current
              : movie,
          );
        });
        return;
      }

      setSelectedMovie(null);
      if (route.view === "filmes" || route.view === "series" || route.view === "lista" || route.view === "genero") {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    };

    syncView();
    window.addEventListener("hashchange", syncView);
    window.addEventListener("popstate", syncView);
    return () => {
      window.removeEventListener("hashchange", syncView);
      window.removeEventListener("popstate", syncView);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hash is the source of truth
  }, [movies]);

  useEffect(() => {
    if (movies.length === 0 || readJsonList(LIST_KEY).length > 0) return;
    try {
      if (window.localStorage.getItem("flixa-list-migrated")) return;
      const legacy = JSON.parse(window.localStorage.getItem(LEGACY_LIST_KEY) ?? "[]") as string[];
      window.localStorage.setItem("flixa-list-migrated", "1");
      if (!Array.isArray(legacy) || legacy.length === 0) return;
      const recovered = dedupeMovies(movies.filter((movie) => legacy.includes(movie.id)));
      if (recovered.length === 0) return;
      queueMicrotask(() => {
        setListMovies(recovered);
        writeJsonList(LIST_KEY, recovered);
      });
    } catch {
      /* ignore */
    }
  }, [movies]);

  useEffect(() => {
    const value = query.trim();
    if (!searchOpen || value.length < 2) return;

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/movies?q=${encodeURIComponent(value)}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!res.ok) return;
        const data = (await res.json()) as { movies?: Movie[] };
        setRemoteResults(Array.isArray(data.movies) ? data.movies : []);
      } catch {
        if (!controller.signal.aborted) setRemoteResults([]);
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 300);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query, searchOpen]);

  useEffect(() => {
    if (view !== "genero" || !genreId) return;

    const controller = new AbortController();
    const timer = window.setTimeout(() => setGenreLoading(true), 0);
    fetch(`/api/movies?genre=${encodeURIComponent(genreId)}&kind=movie&page=1`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { movies?: Movie[] } | null) => {
        setGenreItems(Array.isArray(data?.movies) ? data.movies : []);
        setGenrePage(1);
      })
      .catch(() => {
        if (!controller.signal.aborted) setGenreItems([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setGenreLoading(false);
      });

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [view, genreId]);

  useEffect(() => {
    if (view !== "filmes" && view !== "series") return;

    const kind = view === "series" ? "tv" : "movie";
    const controller = new AbortController();
    const timer = window.setTimeout(() => setBrowseLoading(true), 0);
    fetch(`/api/movies?browse=1&kind=${kind}&page=${catalogPage}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { movies?: Movie[]; totalPages?: number; totalResults?: number } | null) => {
        setBrowseItems(Array.isArray(data?.movies) ? data.movies : []);
        setBrowsePages(Math.max(1, Number(data?.totalPages) || 1));
        setBrowseTotal(Math.max(0, Number(data?.totalResults) || 0));
        window.scrollTo({ top: 0, behavior: "smooth" });
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setBrowseItems([]);
          setBrowsePages(1);
          setBrowseTotal(0);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setBrowseLoading(false);
      });

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [view, catalogPage]);

  const uniqueMovies = useMemo(() => dedupeMovies(movies.filter((movie) => mediaKind(movie) === "movie")), [movies]);
  const uniqueSeries = useMemo(() => dedupeMovies(movies.filter((movie) => mediaKind(movie) === "tv")), [movies]);
  const heroPool = uniqueMovies.slice(0, 5);

  useEffect(() => {
    if (heroPaused || heroPool.length < 2 || view !== "home") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => {
      setHeroIndex((current) => (current + 1) % heroPool.length);
    }, 8000);
    return () => window.clearInterval(timer);
  }, [heroPaused, heroPool.length, view]);

  const featuredMovie = heroPool[heroIndex] ?? heroPool[0] ?? null;

  const catalogRows = useMemo(() => {
    const order = Array.from(new Set(movies.map((movie) => movie.source).filter((source): source is string => Boolean(source))));
    return order
      .map((source) => {
        const items = dedupeMovies(movies.filter((movie) => movie.source === source));
        return {
          title: source,
          kind: items[0] ? mediaKind(items[0]) : "movie" as MediaKind,
          listId: items.find((item) => item.list)?.list,
          items,
        };
      })
      .filter((row) => row.items.length > 0);
  }, [movies]);

  const activeGenre = genres.find((genre) => String(genre.id) === genreId) ?? null;

  const searchResults = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return [];
    const local = [...uniqueMovies, ...uniqueSeries].filter((movie) => {
      const haystack = `${movie.title} ${movie.genres?.join(" ")} ${movie.year ?? ""}`.toLowerCase();
      return haystack.includes(value);
    });
    const localKeys = new Set(local.map(movieKey));
    const extra = remoteResults.filter((movie) => !localKeys.has(movieKey(movie)));
    return dedupeMovies([...local, ...extra]);
  }, [uniqueMovies, uniqueSeries, query, remoteResults]);

  const toggleList = (movie: Movie) => {
    setListMovies((current) => {
      const exists = isListed(current, movie);
      const next = exists
        ? current.filter((item) => movieKey(item) !== movieKey(movie))
        : [movie, ...current.filter((item) => movieKey(item) !== movieKey(movie))];
      writeJsonList(LIST_KEY, next);
      showToast(exists ? `${movie.title} saiu da lista` : `${movie.title} entrou na lista`);
      return next;
    });
  };

  function goTo(hash: string) {
    const next = `#${hash}`;
    if (window.location.hash === next) return;
    window.history.pushState(null, "", next);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  }

  function openDetails(movie: Movie) {
    setSearchOpen(false);
    setSelectedMovie(movie);
    goTo(detailsHash(movie));
  }

  const closeDetails = useCallback(() => {
    setSelectedMovie(null);
    goTo(catalogReturnHash(lastCatalogHash.current));
  }, []);

  function rememberWatch(movie: Movie) {
    setRecentMovies((current) => {
      const next = dedupeMovies([movie, ...current]).slice(0, 16);
      writeJsonList(RECENT_KEY, next);
      return next;
    });
  }

  function openPlayer(movie: Movie) {
    setSearchOpen(false);
    setSelectedMovie(null);
    setPlayerMovie(movie);
    rememberWatch(movie);
    goTo(playerHash(movie));
  }

  const closePlayer = useCallback(() => {
    setPlayerMovie(null);
    setSelectedMovie(null);
    goTo(catalogReturnHash(lastCatalogHash.current));
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = Boolean(target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable));

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen((value) => !value);
        setQuery("");
        return;
      }

      if (event.key === "/" && !typing && !playerMovie) {
        event.preventDefault();
        setSearchOpen(true);
        return;
      }

      if (event.key !== "Escape") return;
      if (playerMovie) closePlayer();
      else if (selectedMovie) closeDetails();
      else if (searchOpen) {
        setSearchOpen(false);
        setQuery("");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [playerMovie, selectedMovie, searchOpen, closeDetails, closePlayer]);

  function exportList() {
    const blob = new Blob([JSON.stringify(listMovies, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "flixa-lista.json";
    link.click();
    URL.revokeObjectURL(url);
    showToast("Lista exportada");
  }

  function importList(file: File) {
    file
      .text()
      .then((text) => {
        const parsed = JSON.parse(text) as Movie[];
        if (!Array.isArray(parsed)) throw new Error("invalid");
        const incoming = parsed.filter((item) => item?.id && item?.title);
        const next = dedupeMovies([...incoming, ...listMovies]);
        setListMovies(next);
        writeJsonList(LIST_KEY, next);
        showToast(`${incoming.length} títulos importados`);
      })
      .catch(() => showToast("Arquivo de lista inválido"));
  }

  async function loadMoreGenre() {
    if (!genreId || genreLoading) return;
    setGenreLoading(true);
    const nextPage = genrePage + 1;
    try {
      const res = await fetch(`/api/movies?genre=${encodeURIComponent(genreId)}&kind=movie&page=${nextPage}`, {
        cache: "no-store",
      });
      const data = (await res.json()) as { movies?: Movie[] };
      const extra = Array.isArray(data.movies) ? data.movies : [];
      setGenreItems((current) => dedupeMovies([...current, ...extra]));
      setGenrePage(nextPage);
    } finally {
      setGenreLoading(false);
    }
  }

  if (authChecking || loading) {
    return (
      <main className="flixa-shell">
        <div className="boot-screen">
          <span className="brand-mark" />
          <p>{authChecking ? "Validando sessão" : "Carregando o catálogo"}</p>
          <div className="skeleton-row" aria-hidden="true">
            {Array.from({ length: 6 }).map((_, index) => (
              <span key={index} className="skeleton-poster" />
            ))}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flixa-shell has-mobile-nav">
      <header className={`flixa-header ${scrolled || searchOpen || view !== "home" ? "is-scrolled" : ""}`}>
        <a className="brand" href="#home" onClick={() => goTo("home")} aria-label="Flixa início">
          <span className="brand-mark" />
          <span>FLIXA</span>
        </a>

        <nav className="nav-links" aria-label="Navegação principal">
          <a href="#home" className={view === "home" ? "is-active" : ""} onClick={() => goTo("home")}>
            Início
          </a>
          <a href="#filmes" className={view === "filmes" ? "is-active" : ""} onClick={() => goTo("filmes")}>
            Filmes
          </a>
          <a href="#series" className={view === "series" ? "is-active" : ""} onClick={() => goTo("series")}>
            Séries
          </a>
          <a
            href="#minha-lista"
            className={view === "lista" ? "is-active" : ""}
            onClick={() => goTo("minha-lista")}
          >
            Minha Lista
            {listMovies.length > 0 ? <em>{listMovies.length}</em> : null}
          </a>
        </nav>

        <div className="header-actions">
          <button
            className={`search-trigger ${searchOpen ? "is-active" : ""}`}
            type="button"
            aria-label={searchOpen ? "Fechar busca" : "Abrir busca"}
            onClick={() => {
              setSearchOpen((value) => !value);
              setQuery("");
            }}
          >
            <span />
          </button>
          {authUser ? (
            <div className="header-user">
              <span className="header-user-name" title={authUser.email}>
                {authUser.nome}
              </span>
              {authUser.administrador ? <span className="header-user-badge">Admin</span> : null}
              <button className="logout-button" type="button" onClick={() => void logout()}>
                Sair
              </button>
            </div>
          ) : null}
        </div>
      </header>

      {searchOpen ? (
        <div className="search-overlay" onClick={() => { setSearchOpen(false); setQuery(""); }}>
          <div className="search-panel" ref={searchPanelRef} onClick={(event) => event.stopPropagation()}>
            <input
              autoFocus
              aria-label="Buscar filmes e séries"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar filme, série, gênero ou ano"
            />
            <p className="search-hint">Atalho <kbd>/</kbd> ou <kbd>⌘K</kbd></p>
            <div className="search-results">
              {query.trim().length < 2 ? (
                <p>Digite pelo menos 2 letras para buscar na TMDB.</p>
              ) : searching && searchResults.length === 0 ? (
                <p>Buscando títulos...</p>
              ) : searchResults.length === 0 ? (
                <p>Nenhum título encontrado.</p>
              ) : (
                searchResults.map((movie) => (
                  <div className="search-result" key={movieKey(movie)}>
                    <button
                      type="button"
                      className="search-result-main"
                      onClick={() => openDetails(movie)}
                    >
                      <MovieThumb movie={movie} />
                      <span>
                        <strong>{movie.title}</strong>
                        <small>
                          {[mediaKind(movie) === "tv" ? "Série" : "Filme", movie.year, movie.genres?.[0]]
                            .filter(Boolean)
                            .join(" · ")}
                        </small>
                      </span>
                    </button>
                    <button
                      type="button"
                      className={`chip-action ${isListed(listMovies, movie) ? "is-on" : ""}`}
                      onClick={() => toggleList(movie)}
                    >
                      {isListed(listMovies, movie) ? "Na lista" : "Adicionar a Lista"}
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}

      {view === "lista" ? (
        <section className="list-view" id="minha-lista">
          <div className="list-view-head">
            <div>
              <p className="eyebrow">Sua coleção</p>
              <h1>Minha Lista</h1>
              <p className="hero-description">
                {listMovies.length
                  ? `${listMovies.length} ${listMovies.length === 1 ? "título salvo" : "títulos salvos"} neste aparelho.`
                  : "Salve títulos do catálogo para assistir depois. A lista fica gravada neste navegador."}
              </p>
            </div>
            <div className="list-tools">
              <button className="secondary-action" type="button" onClick={exportList} disabled={listMovies.length === 0}>
                Exportar
              </button>
              <button className="secondary-action" type="button" onClick={() => importRef.current?.click()}>
                Importar
              </button>
              <input
                ref={importRef}
                type="file"
                accept="application/json"
                hidden
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) importList(file);
                  event.target.value = "";
                }}
              />
              <a className="secondary-action" href="#filmes" onClick={() => goTo("filmes")}>
                Explorar catálogo
              </a>
            </div>
          </div>

          {listMovies.length ? (
            <div className="poster-grid">
              {listMovies.map((movie) => (
                <MovieCard
                  key={movieKey(movie)}
                  movie={movie}
                  inList
                  onOpen={openDetails}
                  onToggleList={toggleList}
                />
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <p>Sua lista ainda está vazia</p>
              <span>Abra um título e toque em “Minha Lista”, ou use Adicionar a Lista na busca.</span>
              <a className="primary-action" href="#filmes" onClick={() => goTo("filmes")}>
                Ver filmes
              </a>
            </div>
          )}
        </section>
      ) : view === "genero" ? (
        <section className="list-view" id="genero">
          <div className="list-view-head">
            <div>
              <p className="eyebrow">Gênero</p>
              <h1>{activeGenre?.name ?? "Catálogo"}</h1>
              <p className="hero-description">Filmes deste gênero na TMDB, ordenados por popularidade.</p>
            </div>
            <a className="secondary-action" href="#filmes" onClick={() => goTo("filmes")}>
              Todos os filmes
            </a>
          </div>
          {genreLoading && genreItems.length === 0 ? (
            <div className="skeleton-row">
              {Array.from({ length: 8 }).map((_, index) => (
                <span key={index} className="skeleton-poster" />
              ))}
            </div>
          ) : genreItems.length ? (
            <>
              <div className="poster-grid">
                {genreItems.map((movie) => (
                  <MovieCard
                    key={movieKey(movie)}
                    movie={movie}
                    inList={isListed(listMovies, movie)}
                    onOpen={openDetails}
                    onToggleList={toggleList}
                  />
                ))}
              </div>
              <button className="text-link load-more" type="button" onClick={loadMoreGenre} disabled={genreLoading}>
                {genreLoading ? "Carregando..." : "Ver mais"}
              </button>
            </>
          ) : (
            <div className="empty-state">
              <p>Nenhum filme neste gênero</p>
              <a className="primary-action" href="#home" onClick={() => goTo("home")}>
                Voltar ao início
              </a>
            </div>
          )}
        </section>
      ) : view === "filmes" || view === "series" ? (
        <section className="list-view" id={view === "series" ? "series" : "filmes"}>
          <div className="list-view-head">
            <div>
              <p className="eyebrow">Mais famosos</p>
              <h1>{view === "series" ? "Séries" : "Filmes"}</h1>
              <p className="hero-description">
                {browseTotal
                  ? `${browseTotal.toLocaleString("pt-BR")} ${view === "series" ? "séries" : "filmes"} mais populares · 50 por página.`
                  : "Carregando o catálogo…"}
              </p>
            </div>
            {browsePages > 1 ? (
              <div className="pager">
                <button
                  className="secondary-action"
                  type="button"
                  disabled={catalogPage <= 1 || browseLoading}
                  onClick={() => goTo(view === "series" ? `series/${catalogPage - 1}` : `filmes/${catalogPage - 1}`)}
                >
                  Anterior
                </button>
                <span>
                  Página {catalogPage} de {browsePages}
                </span>
                <button
                  className="secondary-action"
                  type="button"
                  disabled={catalogPage >= browsePages || browseLoading}
                  onClick={() => goTo(view === "series" ? `series/${catalogPage + 1}` : `filmes/${catalogPage + 1}`)}
                >
                  Próxima
                </button>
              </div>
            ) : null}
          </div>
          {browseLoading && browseItems.length === 0 ? (
            <div className="skeleton-row">
              {Array.from({ length: 10 }).map((_, index) => (
                <span key={index} className="skeleton-poster" />
              ))}
            </div>
          ) : browseItems.length ? (
            <>
              <div className="poster-grid">
                {browseItems.map((movie) => (
                  <MovieCard
                    key={movieKey(movie)}
                    movie={movie}
                    inList={isListed(listMovies, movie)}
                    onOpen={openDetails}
                    onToggleList={toggleList}
                  />
                ))}
              </div>
              {browsePages > 1 ? (
                <div className="pager pager-bottom">
                  <button
                    className="secondary-action"
                    type="button"
                    disabled={catalogPage <= 1 || browseLoading}
                    onClick={() => goTo(view === "series" ? `series/${catalogPage - 1}` : `filmes/${catalogPage - 1}`)}
                  >
                    Anterior
                  </button>
                  <span>
                    Página {catalogPage} de {browsePages}
                  </span>
                  <button
                    className="secondary-action"
                    type="button"
                    disabled={catalogPage >= browsePages || browseLoading}
                    onClick={() => goTo(view === "series" ? `series/${catalogPage + 1}` : `filmes/${catalogPage + 1}`)}
                  >
                    Próxima
                  </button>
                </div>
              ) : null}
            </>
          ) : (
            <div className="empty-state">
              <p>{view === "series" ? "Nenhuma série no catálogo" : "Nenhum filme no catálogo"}</p>
              <a className="primary-action" href="#home" onClick={() => goTo("home")}>
                Voltar ao início
              </a>
            </div>
          )}
        </section>
      ) : (
        <>
          {featuredMovie ? (
            <section
              className="hero"
              id="home"
              onMouseEnter={() => setHeroPaused(true)}
              onMouseLeave={() => setHeroPaused(false)}
            >
              {imageSrc(featuredMovie.backdrop || featuredMovie.poster, "w1280") ? (
                <img
                  className="hero-media"
                  src={imageSrc(featuredMovie.backdrop || featuredMovie.poster, "w1280")}
                  alt=""
                />
              ) : null}
              <div className="hero-content">
                <p className="eyebrow">Em destaque</p>
                <h1>{featuredMovie.title}</h1>
                {featuredMovie.description ? (
                  <p className="hero-description">{featuredMovie.description}</p>
                ) : null}
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
                    className={`secondary-action ${isListed(listMovies, featuredMovie) ? "is-on" : ""}`}
                    type="button"
                    onClick={() => toggleList(featuredMovie)}
                  >
                    {isListed(listMovies, featuredMovie) ? "Na Minha Lista" : "Minha Lista"}
                  </button>
                  <button className="ghost-action" type="button" onClick={() => openDetails(featuredMovie)}>
                    Detalhes
                  </button>
                </div>
                {heroPool.length > 1 ? (
                  <div className="hero-dots" role="tablist" aria-label="Destaques">
                    {heroPool.map((movie, index) => (
                      <button
                        key={movieKey(movie)}
                        type="button"
                        className={index === heroIndex ? "is-active" : ""}
                        aria-label={`Ver ${movie.title}`}
                        onClick={() => setHeroIndex(index)}
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            </section>
          ) : (
            <section className="hero" id="home">
              <div className="hero-content">
                <p className="eyebrow">Catálogo Flixa</p>
                <h1>Catálogo indisponível</h1>
                <p className="hero-description">{loadError ?? "As APIs não devolveram títulos neste momento."}</p>
                <div className="hero-actions">
                  <button className="primary-action" type="button" onClick={() => fetchCatalog(true)}>
                    Tentar de novo
                  </button>
                </div>
              </div>
            </section>
          )}

          <section className="content-rows" aria-label="Catálogo">
            {genres.length ? (
              <section className="genre-board" aria-label="Gêneros">
                <div className="genre-board-head">
                  <h2>Gêneros</h2>
                </div>
                <div className="genre-row">
                  {genres.map((genre) => (
                    <a
                      key={genre.id}
                      className="genre-chip"
                      href={`#genero/${genre.id}`}
                      onClick={() => goTo(`genero/${genre.id}`)}
                    >
                      <span>{genre.name}</span>
                    </a>
                  ))}
                </div>
              </section>
            ) : null}

            {recentMovies.length ? (
              <MovieRow
                title="Continuar assistindo"
                items={recentMovies}
                listed={listMovies}
                onOpen={openDetails}
                onToggleList={toggleList}
              />
            ) : null}

            {listMovies.length ? (
              <MovieRow
                title="Minha Lista"
                items={listMovies}
                listed={listMovies}
                onOpen={openDetails}
                onToggleList={toggleList}
                onSeeAll={() => goTo("minha-lista")}
              />
            ) : null}

            {catalogRows.map((row) => (
              <MovieRow
                key={row.title}
                title={row.title}
                items={row.items}
                listId={row.listId}
                listed={listMovies}
                onOpen={openDetails}
                onToggleList={toggleList}
              />
            ))}

            <p className="tmdb-credit">
              Este produto usa a API do TMDB, mas não é endossado ou certificado pelo TMDB.
            </p>
          </section>
        </>
      )}

      {selectedMovie ? (
        <MovieDetails
          key={movieKey(selectedMovie)}
          movie={selectedMovie}
          inList={isListed(listMovies, selectedMovie)}
          listed={listMovies}
          onClose={closeDetails}
          onToggleList={toggleList}
          onWatch={openPlayer}
          onOpen={openDetails}
        />
      ) : null}

      {playerMovie ? (
        <MoviePlayer movie={playerMovie} onClose={closePlayer} />
      ) : null}

      {toast ? <div className="toast" role="status">{toast}</div> : null}

      <nav className="mobile-nav" aria-label="Navegação inferior">
        <a href="#home" className={view === "home" ? "is-active" : ""} onClick={() => goTo("home")}>
          Início
        </a>
        <a href="#filmes" className={view === "filmes" ? "is-active" : ""} onClick={() => goTo("filmes")}>
          Filmes
        </a>
        <a href="#series" className={view === "series" ? "is-active" : ""} onClick={() => goTo("series")}>
          Séries
        </a>
        <a href="#minha-lista" className={view === "lista" ? "is-active" : ""} onClick={() => goTo("minha-lista")}>
          Lista
          {listMovies.length > 0 ? <em>{listMovies.length}</em> : null}
        </a>
      </nav>
    </main>
  );
}

function MovieThumb({ movie }: { movie: Movie }) {
  const src = imageSrc(movie.poster);
  return src ? (
    <img className="mini-poster" src={src} alt="" width={42} height={63} />
  ) : (
    <span className="mini-poster mini-poster-fallback">{movie.title.slice(0, 1)}</span>
  );
}

function MovieRow({
  title,
  items,
  listed,
  listId,
  onOpen,
  onToggleList,
  onSeeAll,
}: {
  title: string;
  items: Movie[];
  listed: Movie[];
  listId?: string;
  onOpen: (movie: Movie) => void;
  onToggleList: (movie: Movie) => void;
  onSeeAll?: () => void;
}) {
  const railRef = useRef<HTMLDivElement>(null);
  const [extra, setExtra] = useState<Movie[]>([]);
  const [page, setPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);

  const allItems = useMemo(() => dedupeMovies([...items, ...extra]), [items, extra]);

  const scroll = (direction: number) => {
    const rail = railRef.current;
    if (!rail) return;
    rail.scrollBy({ left: direction * Math.min(rail.clientWidth * 0.86, 720), behavior: "smooth" });
  };

  async function loadMore() {
    if (!listId || loadingMore) return;
    setLoadingMore(true);
    const nextPage = page + 1;
    try {
      const res = await fetch(`/api/movies?list=${encodeURIComponent(listId)}&page=${nextPage}`, { cache: "no-store" });
      const data = (await res.json()) as { movies?: Movie[] };
      const more = Array.isArray(data.movies) ? data.movies : [];
      setExtra((current) => dedupeMovies([...current, ...more]));
      setPage(nextPage);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <section className="movie-row">
      <div className="row-head">
        <h2>{title}</h2>
        <div className="row-tools">
          {onSeeAll ? (
            <button className="text-link" type="button" onClick={onSeeAll}>
              Ver tudo
            </button>
          ) : null}
          {listId ? (
            <button className="text-link" type="button" onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? "Carregando" : "Ver mais"}
            </button>
          ) : null}
          <button type="button" className="rail-btn" aria-label={`Rolar ${title} para trás`} onClick={() => scroll(-1)}>
            ‹
          </button>
          <button type="button" className="rail-btn" aria-label={`Rolar ${title} para frente`} onClick={() => scroll(1)}>
            ›
          </button>
        </div>
      </div>
      <div className="rail" ref={railRef}>
        {allItems.map((movie) => (
          <MovieCard
            key={movieKey(movie)}
            movie={movie}
            inList={isListed(listed, movie)}
            onOpen={onOpen}
            onToggleList={onToggleList}
          />
        ))}
      </div>
    </section>
  );
}

function MovieCard({
  movie,
  inList,
  onOpen,
  onToggleList,
}: {
  movie: Movie;
  inList: boolean;
  onOpen: (movie: Movie) => void;
  onToggleList: (movie: Movie) => void;
}) {
  const src = imageSrc(movie.poster);

  return (
    <article className="movie-card">
      <div className="poster-wrap">
        <button className="poster-hit" type="button" onClick={() => onOpen(movie)}>
          <span className="poster-frame">
            {src ? (
              <img src={src} alt={`Pôster de ${movie.title}`} width={342} height={513} loading="lazy" />
            ) : (
              <span className="poster-fallback">{movie.title}</span>
            )}
            {formatScore(movie.rating) ? <span className="score-badge">{formatScore(movie.rating)}</span> : null}
          </span>
        </button>
        <button
          className={`card-list-btn ${inList ? "is-on" : ""}`}
          type="button"
          onClick={() => onToggleList(movie)}
        >
          {inList ? "Remover da lista" : "Adicionar a Lista"}
        </button>
      </div>
      <div className="card-meta">
        <strong>{movie.title}</strong>
        <div className="card-tags">
          {mediaKind(movie) === "tv" ? <span className="card-kind">Série</span> : null}
          {movie.genres?.[0] ? <span className="card-genre">{movie.genres[0]}</span> : null}
          {movie.year ? <span className="card-year">{movie.year}</span> : null}
        </div>
      </div>
    </article>
  );
}

function MovieDetails({
  movie,
  inList,
  listed,
  onClose,
  onToggleList,
  onWatch,
  onOpen,
}: {
  movie: Movie;
  inList: boolean;
  listed: Movie[];
  onClose: () => void;
  onToggleList: (movie: Movie) => void;
  onWatch: (movie: Movie) => void;
  onOpen: (movie: Movie) => void;
}) {
  const [details, setDetails] = useState(movie);
  const [similar, setSimilar] = useState<Movie[]>([]);
  const [showTrailer, setShowTrailer] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useFocusTrap(true, panelRef);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  useEffect(() => {
    const id = titleId(movie);
    if (!id) return;

    const controller = new AbortController();
    fetch(`/api/movies?id=${encodeURIComponent(id)}&kind=${mediaKind(movie)}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { movie?: Movie; similar?: Movie[] } | null) => {
        if (data?.movie) {
          setDetails({ ...movie, ...data.movie, id: movie.id, source: movie.source, kind: mediaKind(movie) });
        }
        if (Array.isArray(data?.similar)) setSimilar(data.similar);
      })
      .catch(() => {});

    return () => controller.abort();
  }, [movie]);

  const backdrop = imageSrc(details.backdrop || details.poster, "w1280");
  const poster = imageSrc(details.poster, "w780");

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={details.title} onClick={onClose}>
      <div className="details-panel" ref={panelRef} onClick={(event) => event.stopPropagation()}>
        <button className="close-button" type="button" onClick={onClose} aria-label="Fechar">
          ×
        </button>
        <div className="details-scroll">
          <div className="details-art">
            {showTrailer && details.trailer ? (
              <iframe
                className="trailer-frame"
                src={`${details.trailer}?autoplay=1`}
                title={`Trailer de ${details.title}`}
                allow="autoplay; encrypted-media; picture-in-picture"
                allowFullScreen
              />
            ) : backdrop ? (
              <img src={backdrop} alt="" />
            ) : null}
          </div>
          <div className="details-body">
            {poster ? <img className="details-poster" src={poster} alt={`Pôster de ${details.title}`} /> : <div className="details-poster" />}
            <div className="details-copy">
              <p className="eyebrow">{mediaKind(details) === "tv" ? "Série" : "Filme"}</p>
              <h2>{details.title}</h2>
              <div className="meta-line">
                {movieMeta(details).map((item) => (
                  <span key={String(item)}>{item}</span>
                ))}
              </div>
              {details.description ? <p>{details.description}</p> : null}
              <div className="details-actions">
                {canWatch(details) ? (
                  <button className="primary-action" type="button" onClick={() => onWatch(details)}>
                    Assistir agora
                  </button>
                ) : null}
                {details.trailer ? (
                  <button className="secondary-action" type="button" onClick={() => setShowTrailer((value) => !value)}>
                    {showTrailer ? "Ocultar trailer" : "Trailer"}
                  </button>
                ) : null}
                <button className={`secondary-action ${inList ? "is-on" : ""}`} type="button" onClick={() => onToggleList(details)}>
                  {inList ? "Remover da lista" : "Minha Lista"}
                </button>
              </div>
              <div className="credits">
                {details.director ? (
                  <span>
                    <strong>{mediaKind(details) === "tv" ? "Criação" : "Direção"}</strong> {details.director}
                  </span>
                ) : null}
                {details.cast?.length ? (
                  <span>
                    <strong>Elenco</strong> {details.cast.join(", ")}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
          {similar.length ? (
            <div className="similar-block">
              <MovieRow
                title="Títulos semelhantes"
                items={similar}
                listed={listed}
                onOpen={onOpen}
                onToggleList={onToggleList}
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

const PLAYER_UI_SELECTOR =
  ".player-view, .player-bar, .player-server-menu, .toast, .flixa-header, .movie-card, .details-panel, .search-panel, .flixa-shell";

function isAllowedPlayerFrame(src: string) {
  return /cdn-embed\.com|superflixapi|warezcdn|themoviedb|image\.tmdb|youtube|googlevideo/.test(src);
}

function isOverlayAd(node: Element) {
  if (!(node instanceof HTMLElement)) return false;
  if (node.closest(PLAYER_UI_SELECTOR)) return false;
  if (
    node.classList.contains("player-view") ||
    node.classList.contains("video-stage") ||
    node.classList.contains("flixa-shell")
  ) {
    return false;
  }

  const playerOpen = document.body.classList.contains("player-open");
  const style = node.getAttribute("style") || "";
  const text = (node.textContent || "").replace(/\s+/g, " ").trim();

  if (node instanceof HTMLIFrameElement && !node.classList.contains("video-stage") && !node.classList.contains("trailer-frame")) {
    const src = `${node.src || ""} ${node.getAttribute("src") || ""}`.toLowerCase();
    if (!src.trim() || src.includes("about:blank")) return playerOpen;
    if (!isAllowedPlayerFrame(src)) {
      if (playerOpen) return true;
      if (/aichouphaugn|popads|exoclick|juicyads|propeller|doubleclick|adsystem|adsterra|tsyndicate|oumaxi|pushground|pushnami/.test(src)) {
        return true;
      }
    }
  }

  if (playerOpen && node.parentElement === document.body) {
    if (node instanceof HTMLAnchorElement) return true;
    if (node instanceof HTMLIFrameElement) return true;
    if (/position:\s*(fixed|absolute)/i.test(style) || /z-index:\s*\d{3,}/i.test(style)) return true;
  }

  if (node.matches("img[src*='aichouphaugn'], a[href*='aichouphaugn']")) return true;
  if (node.querySelector(":scope img[src*='aichouphaugn'], :scope a[href*='aichouphaugn']")) return true;
  if (style.includes("Roboto") && style.includes("translate(-50%") && style.includes("position: absolute")) return true;
  if (style.includes("max-width: 355px") && /\bAd\b|Continuar|Fechar|JACKPOT/i.test(text)) return true;
  if (/Está com Sorte|Gira a Roda|JACKPOT|Ganhe agora|Claim now|Congratulations|You won/i.test(text) && /position:\s*(absolute|fixed)/i.test(style)) {
    return true;
  }
  if (/z-index:\s*(9{3,}|\d{5,})/i.test(style) && /pointer-events:\s*all/i.test(style) && /position:\s*(absolute|fixed)/i.test(style)) {
    return true;
  }
  return Array.from(node.querySelectorAll(":scope > div")).some((item) => {
    const badge = (item.textContent || "").trim();
    const badgeStyle = item.getAttribute("style") || "";
    return badge === "Ad" && badgeStyle.includes("171, 202, 56");
  });
}

function scrubOverlayAds(root: ParentNode = document) {
  root.querySelectorAll("img, iframe, div, a, section, aside").forEach((node) => {
    if (isOverlayAd(node)) node.remove();
  });
}

function installPlayerAdblock() {
  const originalOpen = window.open.bind(window);
  window.open = (() => null) as typeof window.open;

  const blockEvent = (event: Event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest(".player-bar, .player-server-menu, .back-button, .video-stage, .player-view")) return;

    if (event instanceof MouseEvent && (event.button === 1 || event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    const anchor = target.closest("a");
    if (!anchor) return;
    const href = anchor.getAttribute("href") || "";
    const isExternal = /^(https?:|\/\/)/i.test(href) || anchor.target === "_blank";
    if (!isExternal) return;
    if (anchor.closest(".video-stage")) return;
    event.preventDefault();
    event.stopPropagation();
  };

  document.addEventListener("click", blockEvent, true);
  document.addEventListener("auxclick", blockEvent, true);
  document.addEventListener("mousedown", blockEvent, true);

  scrubOverlayAds();
  const observer = new MutationObserver(() => scrubOverlayAds());
  observer.observe(document.documentElement, { childList: true, subtree: true });
  const timer = window.setInterval(() => scrubOverlayAds(), 250);

  return () => {
    window.open = originalOpen;
    document.removeEventListener("click", blockEvent, true);
    document.removeEventListener("auxclick", blockEvent, true);
    document.removeEventListener("mousedown", blockEvent, true);
    observer.disconnect();
    window.clearInterval(timer);
  };
}

type PlayerSourceId = string;
type PlayerTheme = "cyan" | "gold" | "violet" | "emerald" | "rose" | "sky";

type PlayerSource = {
  id: PlayerSourceId;
  name: string;
  hint: string;
  theme: PlayerTheme;
  src: string;
};

function buildPlayerSources(movie: Movie): PlayerSource[] {
  const imdbId = movie.imdb_id && movie.imdb_id !== "N/A" ? movie.imdb_id : (movie.id.startsWith("tt") ? movie.id : "");
  const tmdbId = movie.tmdb_id && movie.tmdb_id !== "N/A" ? movie.tmdb_id : titleId(movie);
  const kind = mediaKind(movie);
  const path = kind === "tv" ? "serie" : "filme";
  const sources: PlayerSource[] = [];

  if (tmdbId) {
    sources.push({
      id: "cdn-tmdb",
      name: "CDN Brasil",
      hint: "PT-BR · TMDB · rápido",
      theme: "cyan",
      src: `https://cdn-embed.com/${path}/${tmdbId}`,
    });
    sources.push({
      id: "superflix-pro",
      name: "SuperFlix",
      hint: "PT-BR · dublado/legendado",
      theme: "gold",
      src: `https://superflixapi.pro/${path}/${tmdbId}#noLink`,
    });
    sources.push({
      id: "superflix-help",
      name: "SuperFlix Alt",
      hint: "PT-BR · espelho oficial",
      theme: "violet",
      src: `https://superflixapi.help/${path}/${tmdbId}`,
    });
    sources.push({
      id: "warez-tmdb",
      name: "WarezCDN",
      hint: "PT-BR · TMDB",
      theme: "emerald",
      src: `https://warezcdn.lat/${path}/${tmdbId}`,
    });
  }

  if (imdbId) {
    sources.push({
      id: "cdn-imdb",
      name: "CDN IMDb",
      hint: "PT-BR · IMDb",
      theme: "sky",
      src: `https://cdn-embed.com/${path}/${imdbId}`,
    });
    sources.push({
      id: "superflix-imdb",
      name: "SuperFlix IMDb",
      hint: "PT-BR · IMDb",
      theme: "rose",
      src: `https://superflixapi.pro/${path}/${imdbId}#noLink`,
    });
    sources.push({
      id: "warez-imdb",
      name: "WarezCDN IMDb",
      hint: "PT-BR · IMDb",
      theme: "emerald",
      src: `https://warezcdn.lat/${path}/${imdbId}`,
    });
  }

  const seen = new Set<string>();
  return sources.filter((source) => {
    if (!source.src || seen.has(source.src)) return false;
    seen.add(source.src);
    return true;
  });
}

function PlayerServerMenu({
  sources,
  activeId,
  onSelect,
  onOpenChange,
}: {
  sources: PlayerSource[];
  activeId: string;
  onSelect: (id: string) => void;
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const active = sources.find((source) => source.id === activeId) ?? sources[0];

  function updateOpen(next: boolean) {
    setOpen(next);
    onOpenChange?.(next);
  }

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) updateOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") updateOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => () => onOpenChange?.(false), [onOpenChange]);

  if (!active || sources.length === 0) return null;

  return (
    <div className={`player-server-menu theme-${active.theme} ${open ? "is-open" : ""}`} ref={menuRef}>
      <button
        type="button"
        className="player-server-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => updateOpen(!open)}
      >
        <span className="player-server-dot" aria-hidden="true" />
        <span className="player-server-copy">
          <strong>{active.name}</strong>
          <small>{active.hint}</small>
        </span>
        <span className="player-server-chevron" aria-hidden="true" />
      </button>

      {open ? (
        <div className="player-server-dropdown" role="listbox" aria-label="Servidores PT-BR">
          <p className="player-server-heading">Servidores em português</p>
          {sources.map((source) => {
            const selected = source.id === active.id;
            return (
              <button
                key={source.id}
                type="button"
                role="option"
                aria-selected={selected}
                className={`player-server-option theme-${source.theme} ${selected ? "is-active" : ""}`}
                onClick={() => {
                  onSelect(source.id);
                  updateOpen(false);
                }}
              >
                <span className="player-server-dot" aria-hidden="true" />
                <span className="player-server-copy">
                  <strong>{source.name}</strong>
                  <small>{source.hint}</small>
                </span>
                {selected ? <span className="player-server-check" aria-hidden="true" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function MoviePlayer({
  movie,
  onClose,
}: {
  movie: Movie;
  onClose: () => void;
}) {
  const sources = buildPlayerSources(movie);
  const [sourceId, setSourceId] = useState<PlayerSourceId>(sources[0]?.id ?? "cdn-tmdb");
  const [showBar, setShowBar] = useState(true);
  const [menuPinned, setMenuPinned] = useState(false);
  const hideBar = useRef<number | null>(null);
  const activeSource = sources.find((source) => source.id === sourceId) ?? sources[0];
  const controlsVisible = showBar || menuPinned;

  useEffect(() => {
    const nextSources = buildPlayerSources(movie);
    setSourceId((current) => (nextSources.some((source) => source.id === current) ? current : (nextSources[0]?.id ?? "cdn-tmdb")));
  }, [movie.id, movie.tmdb_id, movie.imdb_id, movie.kind]);

  useEffect(() => {
    document.body.classList.add("player-open");
    const cleanup = installPlayerAdblock();
    return () => {
      document.body.classList.remove("player-open");
      cleanup();
    };
  }, []);

  useEffect(() => {
    const reveal = () => {
      setShowBar(true);
      if (menuPinned) return;
      if (hideBar.current) window.clearTimeout(hideBar.current);
      hideBar.current = window.setTimeout(() => setShowBar(false), 2400);
    };
    reveal();
    window.addEventListener("mousemove", reveal);
    return () => {
      window.removeEventListener("mousemove", reveal);
      if (hideBar.current) window.clearTimeout(hideBar.current);
    };
  }, [menuPinned]);

  return (
    <div className={`player-view ${controlsVisible ? "show-controls" : ""} ${activeSource ? `theme-${activeSource.theme}` : ""}`}>
      <div className="player-bar">
        <button className="player-back" type="button" onClick={onClose}>
          <span className="player-back-icon" aria-hidden="true" />
          Voltar
        </button>
        <div className="player-heading">
          <span className="player-kicker">{mediaKind(movie) === "tv" ? "Série" : "Filme"} · PT-BR</span>
          <strong className="player-title">{movie.title}</strong>
        </div>
        <div className="player-toolbar">
          <PlayerServerMenu
            sources={sources}
            activeId={activeSource?.id ?? ""}
            onSelect={setSourceId}
            onOpenChange={setMenuPinned}
          />
        </div>
      </div>

      {activeSource ? (
        <iframe
          key={activeSource.src}
          className="video-stage"
          src={activeSource.src}
          allowFullScreen
          allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
          referrerPolicy="no-referrer"
          sandbox="allow-scripts allow-same-origin allow-forms allow-presentation allow-orientation-lock"
          title={movie.title}
        />
      ) : (
        <div className="video-stage video-empty">
          <p>Este título ainda não tem um ID válido para reprodução.</p>
        </div>
      )}
    </div>
  );
}
