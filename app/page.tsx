"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import {
  DEFAULT_DISABLED_PLAYER_SERVER_IDS,
  getPlayerServer,
  playerServerIdForSource,
} from "../lib/player-servers";
import BorderCollieForum from "./border-collie-forum";
import FriendsView, { type FriendActivity } from "./friends-view";
import LoginForm from "./login-form";
import SeriesRecapModal from "./series-recap-modal";
import SiteIntro from "./site-intro";
import SportsView from "./sports-view";
import UsernameSetupModal from "./username-setup-modal";
import WatchPartyControls from "./watch-party-controls";

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
  genreIds?: number[];
  rating?: string;
  director?: string;
  cast?: string[];
  trailer?: string;
  progress?: number;
  season?: number;
  episode?: number;
  positionSeconds?: number;
  available?: boolean;
  server_count?: number;
  provider_available?: boolean;
  playback_locale?: "pt-BR";
  is_brazilian?: boolean;
};

type Genre = { id: number; name: string };
type View = "home" | "filmes" | "series" | "esportes" | "lista" | "surpreenda-me" | "grupo" | "amigos";
type AuthUser = {
  id: number;
  nome: string;
  username: string | null;
  email: string;
  administrador: boolean;
};

type TvSeasonInfo = {
  season_number: number;
  episode_count: number;
  name: string;
  air_date?: string;
  poster?: string;
};

type TvEpisodeInfo = {
  episode_number: number;
  name: string;
  overview?: string;
  still?: string;
  runtime?: number;
  air_date?: string;
};

const LIST_KEY = "flixa-saved-movies";
const LEGACY_LIST_KEY = "flixa-list";
const ROLETA_SKIP_KEY = "flixa-roleta-pulados";
const ROLETA_WATCHED_KEY = "flixa-roleta-assistidos";
const ROLETA_LEGACY_SEEN_KEY = "flixa-roleta-vistos";

type RouletteWatched = Movie & { watchedAt: string; genreName?: string };

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

function asMovieList(value: unknown): Movie[] {
  return Array.isArray(value)
    ? value.filter((item): item is Movie => Boolean(item && typeof item === "object" && "id" in item && "title" in item))
    : [];
}

function imageSrc(value?: string, size?: "w342" | "w780" | "w1280") {
  if (!value) return "";
  const nested = value.match(/url\(['"]?([^'")]+)['"]?\)/);
  const raw = nested?.[1] || value;
  if (!raw.startsWith("http://") && !raw.startsWith("https://")) return "";
  const resized = size ? raw.replace(/\/w\d+\//, `/${size}/`) : raw;
  try {
    const url = new URL(resized);
    if (url.hostname === "image.tmdb.org" || url.hostname === "media.themoviedb.org") {
      const match = url.pathname.match(/^\/t\/p\/(w\d+|original)(\/.*)$/);
      if (match) {
        const proxySize = size || match[1];
        return `/api/images/tmdb?size=${encodeURIComponent(proxySize)}&path=${encodeURIComponent(match[2])}`;
      }
    }
  } catch {
    return "";
  }
  return resized;
}

function ResilientImage({
  sources,
  alt,
  className,
  loading,
  fallback,
}: {
  sources: Array<string | undefined>;
  alt: string;
  className?: string;
  loading?: "eager" | "lazy";
  fallback: ReactNode;
}) {
  const urls = [...new Set(sources.filter((source): source is string => Boolean(source)))];
  const [index, setIndex] = useState(0);

  if (!urls[index]) return <>{fallback}</>;
  return (
    <img
      className={className}
      src={urls[index]}
      alt={alt}
      loading={loading}
      onError={() => setIndex((current) => current + 1)}
    />
  );
}

function preloadPosterImages(movies: Movie[]) {
  const urls = [
    ...new Set(movies.map((movie) => imageSrc(movie.poster)).filter(Boolean)),
  ] as string[];
  if (!urls.length) return Promise.resolve();
  return Promise.all(
    urls.map(
      (url) =>
        new Promise<void>((resolve) => {
          const img = new Image();
          img.decoding = "async";
          img.onload = () => resolve();
          img.onerror = () => resolve();
          img.src = url;
        }),
    ),
  ).then(() => undefined);
}

function formatScore(value?: string) {
  if (!value) return "";
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toFixed(1) : value;
}

function movieMeta(movie: Movie) {
  return [
    mediaKind(movie) === "tv" ? "Série" : "Filme",
    movie.is_brazilian ? "Brasil" : null,
    movie.year,
    movie.duration,
    movie.genres?.slice(0, 2).join(" · "),
    formatScore(movie.rating) || null,
  ].filter((item) => item != null && String(item).trim() !== "");
}

function playbackId(movie: Movie) {
  const tmdbId = String(movie.tmdb_id || "").trim();
  if (/^\d+$/.test(tmdbId)) return tmdbId;
  const imdbId = String(movie.imdb_id || "").trim();
  if (/^tt\d+$/i.test(imdbId)) return imdbId;
  const id = titleId(movie);
  return /^\d+$|^tt\d+$/i.test(id) ? id : "";
}

function canWatch(movie: Movie) {
  return movie.available !== false && Boolean(playbackId(movie));
}

function availabilityKey(movie: Movie) {
  return `${mediaKind(movie)}:${playbackId(movie)}`;
}

async function retainAvailableMovies(items: Movie[], signal?: AbortSignal) {
  const movies = dedupeMovies(items);
  if (movies.length === 0) return [];

  try {
    const response = await fetch("/api/movies/availability", {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: movies.map((movie) => ({
          kind: mediaKind(movie),
          tmdb_id: movie.tmdb_id,
          imdb_id: movie.imdb_id,
          id: movie.id,
        })),
      }),
      signal,
    });
    if (!response.ok) return [];
    const data = (await response.json()) as { available?: string[]; provider_available?: string[] };
    const available = new Set(Array.isArray(data.available) ? data.available : []);
    const providerAvailable = new Set(Array.isArray(data.provider_available) ? data.provider_available : []);
    return movies
      .filter((movie) => available.has(availabilityKey(movie)))
      .map((movie) => ({
        ...movie,
        available: true,
        provider_available: providerAvailable.has(availabilityKey(movie)),
        playback_locale: "pt-BR" as const,
      }));
  } catch {
    return [];
  }
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

function readRouletteSkipped(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(ROLETA_SKIP_KEY) ?? "[]") as unknown;
    return Array.isArray(parsed) ? parsed.filter((key): key is string => typeof key === "string" && key.length > 0) : [];
  } catch {
    return [];
  }
}

function writeRouletteSkipped(keys: string[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ROLETA_SKIP_KEY, JSON.stringify(keys.slice(0, 500)));
}

function readRouletteWatched(): RouletteWatched[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(ROLETA_WATCHED_KEY) ?? "[]") as RouletteWatched[];
    return Array.isArray(parsed)
      ? parsed.filter((item) => item?.id && item?.title).map((item) => ({ ...item, kind: "movie" as const }))
      : [];
  } catch {
    return [];
  }
}

function writeRouletteWatched(items: RouletteWatched[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ROLETA_WATCHED_KEY, JSON.stringify(items.slice(0, 200)));
}

function migrateRouletteStorage() {
  if (typeof window === "undefined") return;
  const legacy = window.localStorage.getItem(ROLETA_LEGACY_SEEN_KEY);
  if (!legacy) return;
  try {
    const parsed = JSON.parse(legacy) as Array<{ id?: string; title?: string; tmdb_id?: string; imdb_id?: string; kind?: string }>;
    if (Array.isArray(parsed) && parsed.length) {
      const legacyKeys = parsed
        .filter((item) => item?.id && item?.title)
        .map((item) => movieKey({ ...item, id: item.id!, title: item.title!, kind: "movie" } as Movie));
      const merged = [...new Set([...readRouletteSkipped(), ...legacyKeys])];
      writeRouletteSkipped(merged);
    }
  } catch {
    /* ignore */
  }
  window.localStorage.removeItem(ROLETA_LEGACY_SEEN_KEY);
}

function isListed(list: Movie[], movie: Movie) {
  return list.some((item) => movieKey(item) === movieKey(movie));
}

function detailsHash(movie: Movie) {
  return mediaKind(movie) === "tv" ? `serie/${titleId(movie)}` : `filme/${titleId(movie)}`;
}

function playerHash(movie: Movie, season?: number, episode?: number) {
  const base = `player/${detailsHash(movie)}`;
  if (mediaKind(movie) === "tv" && season && episode) {
    return `${base}/s/${season}/e/${episode}`;
  }
  return base;
}

function mergeMovieProgress(movie: Movie, progressList: Movie[]): Movie {
  const saved = progressList.find((item) => movieKey(item) === movieKey(movie));
  if (!saved) return movie;
  return {
    ...movie,
    progress: saved.progress ?? movie.progress,
    season: saved.season ?? movie.season,
    episode: saved.episode ?? movie.episode,
    positionSeconds: saved.positionSeconds ?? movie.positionSeconds,
  };
}

function tvProgressLabel(movie: Movie) {
  void movie;
  return "";
}

function catalogReturnHash(hash: string) {
  const route = parseRoute(hash);
  if (route.selected || route.player) return "home";
  return hash.replace(/^#/, "") || "home";
}

function catalogPath(view: "filmes" | "series", page = 1, genreId?: string | null) {
  const genrePart = genreId ? `/genero/${genreId}` : "";
  const pagePart = page > 1 ? `/${page}` : "";
  return `${view}${genrePart}${pagePart}`;
}

function parseRoute(hash: string) {
  const raw = hash.replace(/^#/, "");
  if (!raw || raw === "home") return { view: "home" as View };
  const catalog = raw.match(/^(filmes|series)(?:\/genero\/(\d+))?(?:\/(\d+))?$/);
  if (catalog) {
    return {
      view: (catalog[1] === "series" ? "series" : "filmes") as View,
      genreId: catalog[2] || null,
      catalogPage: Math.max(1, Number(catalog[3] || "1") || 1),
    };
  }
  if (raw === "minha-lista" || raw === "lista") return { view: "lista" as View };
  if (raw === "esportes" || raw === "sports") return { view: "esportes" as View };
  if (raw === "surpreenda-me" || raw === "roleta") return { view: "surpreenda-me" as View };
  if (raw === "assistir-em-grupo" || raw === "grupo") return { view: "grupo" as View };
  if (raw === "amigos" || raw === "amizades") return { view: "amigos" as View };

  const genre = raw.match(/^genero\/(\d+)$/);
  if (genre) {
    return {
      view: "filmes" as View,
      genreId: genre[1],
      catalogPage: 1,
    };
  }

  const player = raw.match(/^player\/(filme|serie)\/([^/]+)(?:\/s\/(\d+)\/e\/(\d+))?$/);
  if (player) {
    const season = player[3] ? Math.max(1, Number(player[3]) || 1) : undefined;
    const episode = player[4] ? Math.max(1, Number(player[4]) || 1) : undefined;
    return {
      view: "home" as View,
      player: {
        kind: (player[1] === "serie" ? "tv" : "movie") as MediaKind,
        id: player[2],
        season,
        episode,
      },
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
  const [loginOpen, setLoginOpen] = useState(false);
  const [movies, setMovies] = useState<Movie[]>([]);
  const [genres, setGenres] = useState<Genre[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
  const [playerMovie, setPlayerMovie] = useState<Movie | null>(null);
  const [recapMovie, setRecapMovie] = useState<Movie | null>(null);
  const [listMovies, setListMovies] = useState<Movie[]>([]);
  const [recentMovies, setRecentMovies] = useState<Movie[]>([]);
  const [continueMovies, setContinueMovies] = useState<Movie[]>([]);
  const [remoteResults, setRemoteResults] = useState<Movie[]>([]);
  const [searching, setSearching] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [view, setView] = useState<View>("home");
  const [genreId, setGenreId] = useState<string | null>(null);
  const [catalogGenres, setCatalogGenres] = useState<Genre[]>([]);
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
  const continueMoviesRef = useRef<Movie[]>([]);
  const searchPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    playerMovieRef.current = playerMovie;
  }, [playerMovie]);

  useEffect(() => {
    continueMoviesRef.current = continueMovies;
  }, [continueMovies]);

  useFocusTrap(searchOpen, searchPanelRef);

  useEffect(() => {
    let ativo = true;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 12000);

    fetch("/api/auth/me", { cache: "no-store", credentials: "include", signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) return null;
        const data = (await res.json()) as { usuario?: AuthUser | null };
        return data.usuario ?? null;
      })
      .then(async (usuario) => {
        if (!ativo) return;
        if (!usuario) {
          setAuthChecking(false);
          return;
        }
        setAuthUser(usuario);
        setAuthChecking(false);

        const [listaRes, historicoRes, progressoRes] = await Promise.all([
          fetch("/api/lista", { cache: "no-store", credentials: "include" }),
          fetch("/api/historico", { cache: "no-store", credentials: "include" }),
          fetch("/api/progresso", { cache: "no-store", credentials: "include" }),
        ]);
        if (!ativo) return;

        const listaData = listaRes.ok ? ((await listaRes.json()) as { itens?: Movie[] }) : { itens: [] };
        const historicoData = historicoRes.ok ? ((await historicoRes.json()) as { itens?: Movie[] }) : { itens: [] };
        const progressoData = progressoRes.ok ? ((await progressoRes.json()) as { itens?: Movie[] }) : { itens: [] };

        let lista = await retainAvailableMovies(asMovieList(listaData.itens), controller.signal);
        const [historico, progresso] = await Promise.all([
          retainAvailableMovies(asMovieList(historicoData.itens), controller.signal),
          retainAvailableMovies(asMovieList(progressoData.itens), controller.signal),
        ]);

        // Migra lista local (formato completo) uma vez para o MySQL.
        const localLista = await retainAvailableMovies(readJsonList(LIST_KEY), controller.signal);
        if (lista.length === 0 && localLista.length > 0) {
          await Promise.all(
            localLista.map((movie) =>
              fetch("/api/lista", {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ movie }),
              }).catch(() => null),
            ),
          );
          const again = await fetch("/api/lista", { cache: "no-store", credentials: "include" });
          if (again.ok) {
            const againData = (await again.json()) as { itens?: Movie[] };
            lista = await retainAvailableMovies(asMovieList(againData.itens), controller.signal);
            if (lista.length > 0) window.localStorage.removeItem(LIST_KEY);
          }
        }

        if (!ativo) return;
        setListMovies(lista);
        setRecentMovies(historico);
        setContinueMovies(progresso.filter((item) => Number(item.progress || 0) > 0).slice(0, 16));
      })
      .catch(() => {
        if (!ativo) return;
        setAuthChecking(false);
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
      window.location.href = "/";
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
          setLoadError("Nenhum título foi encontrado no catálogo neste momento.");
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
    let frame = 0;
    const updateScrollState = () => {
      frame = 0;
      const next = window.scrollY > 16;
      setScrolled((current) => current === next ? current : next);
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(updateScrollState);
    };
    updateScrollState();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  async function resolveTitle(id: string, kind: MediaKind) {
    const local = [...movies, ...listMovies, ...recentMovies, ...continueMoviesRef.current].find(
      (item) => titleId(item) === id && mediaKind(item) === kind,
    );
    if (local) return mergeMovieProgress(local, continueMoviesRef.current);
    const res = await fetch(`/api/movies?id=${encodeURIComponent(id)}&kind=${kind}`, { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as { movie?: Movie };
    return data.movie ? mergeMovieProgress(data.movie, continueMoviesRef.current) : null;
  }

  useEffect(() => {
    const syncView = (event?: Event) => {
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
          const merged = mergeMovieProgress(movie, continueMoviesRef.current);
          const season = route.player.season ?? merged.season ?? (route.player.kind === "tv" ? 1 : undefined);
          const episode = route.player.episode ?? merged.episode ?? (route.player.kind === "tv" ? 1 : undefined);
          const enriched: Movie = {
            ...merged,
            kind: route.player.kind,
            season,
            episode,
          };
          setSelectedMovie(null);
          setPlayerMovie((current) =>
            current &&
            titleId(current) === titleId(enriched) &&
            mediaKind(current) === mediaKind(enriched) &&
            current.season === enriched.season &&
            current.episode === enriched.episode
              ? current
              : enriched,
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
        const back = lastCatalogHash.current.replace(/^#/, "");
        if (back === "surpreenda-me" || back === "roleta") {
          setView("surpreenda-me");
        }
        return;
      }

      setSelectedMovie(null);
      if (event && (
        route.view === "filmes" ||
        route.view === "series" ||
        route.view === "esportes" ||
        route.view === "lista" ||
        route.view === "surpreenda-me" ||
        route.view === "grupo" ||
        route.view === "amigos"
      )) {
        window.scrollTo({ top: 0, behavior: "auto" });
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
    if (movies.length === 0 || listMovies.length > 0) return;
    try {
      if (window.localStorage.getItem("flixa-list-migrated")) return;
      const legacy = JSON.parse(window.localStorage.getItem(LEGACY_LIST_KEY) ?? "[]") as string[];
      window.localStorage.setItem("flixa-list-migrated", "1");
      if (!Array.isArray(legacy) || legacy.length === 0) return;
      const recovered = dedupeMovies(movies.filter((movie) => legacy.includes(movie.id)));
      if (recovered.length === 0) return;
      queueMicrotask(() => {
        void (async () => {
          await Promise.all(
            recovered.map((movie) =>
              fetch("/api/lista", {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ movie }),
              }).catch(() => null),
            ),
          );
          setListMovies((current) => dedupeMovies([...recovered, ...current]));
        })();
      });
    } catch {
      /* ignore */
    }
  }, [movies, listMovies.length]);

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
    if (view !== "filmes" && view !== "series") return;

    const kind = view === "series" ? "tv" : "movie";
    const controller = new AbortController();
    fetch(`/api/movies?genres=1&kind=${kind}`, { cache: "no-store", signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { genres?: Genre[] } | null) => {
        setCatalogGenres(Array.isArray(data?.genres) ? data.genres : []);
      })
      .catch(() => {
        if (!controller.signal.aborted) setCatalogGenres([]);
      });

    return () => controller.abort();
  }, [view]);

  useEffect(() => {
    if (view !== "filmes" && view !== "series") return;

    const kind = view === "series" ? "tv" : "movie";
    const controller = new AbortController();
    const timer = window.setTimeout(() => setBrowseLoading(true), 0);
    const genreParam = genreId ? `&genre=${encodeURIComponent(genreId)}` : "";
    fetch(`/api/movies?browse=1&kind=${kind}&page=${catalogPage}${genreParam}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { movies?: Movie[]; totalPages?: number; totalResults?: number } | null) => {
        setBrowseItems(Array.isArray(data?.movies) ? data.movies : []);
        setBrowsePages(Math.max(1, Number(data?.totalPages) || 1));
        setBrowseTotal(Math.max(0, Number(data?.totalResults) || 0));
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
  }, [view, catalogPage, genreId]);

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
  const groupCandidates = useMemo(() => dedupeMovies([
    ...continueMovies,
    ...listMovies,
    ...uniqueMovies,
    ...uniqueSeries,
  ]).filter(canWatch).slice(0, 18), [continueMovies, listMovies, uniqueMovies, uniqueSeries]);

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

  const activeGenre = catalogGenres.find((genre) => String(genre.id) === genreId)
    ?? (view === "filmes" ? genres.find((genre) => String(genre.id) === genreId) : null)
    ?? null;

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
    const exists = isListed(listMovies, movie);
    setListMovies((current) => {
      const next = exists
        ? current.filter((item) => movieKey(item) !== movieKey(movie))
        : [movie, ...current.filter((item) => movieKey(item) !== movieKey(movie))];
      return next;
    });
    showToast(exists ? `${movie.title} saiu da lista` : `${movie.title} entrou na lista`);

    void (async () => {
      try {
        if (exists) {
          await fetch(`/api/lista?chave=${encodeURIComponent(movieKey(movie))}`, {
            method: "DELETE",
            credentials: "include",
          });
        } else {
          await fetch("/api/lista", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ movie }),
          });
        }
      } catch {
        showToast("Não foi possível sincronizar a lista");
      }
    })();
  };

  function removeFromContinue(movie: Movie) {
    const key = movieKey(movie);
    setContinueMovies((current) => current.filter((item) => movieKey(item) !== key));
    showToast(`${movie.title} saiu de Continuar assistindo`);

    void fetch(`/api/progresso?chave=${encodeURIComponent(key)}`, {
      method: "DELETE",
      credentials: "include",
    })
      .then((response) => {
        if (!response.ok) throw new Error("Falha ao remover progresso");
      })
      .catch(() => {
        setContinueMovies((current) => dedupeMovies([movie, ...current]).slice(0, 16));
        showToast("Não foi possível remover. Tente novamente.");
      });
  }

  function goTo(hash: string) {
    const next = `#${hash}`;
    if (window.location.hash === next) return;
    window.history.pushState(null, "", next);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  }

  function openDetails(movie: Movie) {
    if (!canWatch(movie)) {
      showToast("Título sem ID válido para reprodução");
      return;
    }
    setSearchOpen(false);
    setSelectedMovie(movie);
    if (view === "surpreenda-me") {
      lastCatalogHash.current = "surpreenda-me";
    }
    goTo(detailsHash(movie));
  }

  const closeDetails = useCallback(() => {
    setSelectedMovie(null);
    goTo(catalogReturnHash(lastCatalogHash.current));
  }, []);

  function rememberWatch(movie: Movie) {
    setRecentMovies((current) => dedupeMovies([movie, ...current]).slice(0, 16));
    void fetch("/api/historico", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ movie }),
    }).catch(() => null);
  }

  const saveProgress = useCallback(
    (
      movie: Movie,
      patch: { progresso?: number; posicao_segundos?: number; temporada?: number | null; episodio?: number | null },
    ) => {
      const nextMovie: Movie = {
        ...movie,
        progress: patch.progresso ?? movie.progress,
        positionSeconds: patch.posicao_segundos ?? movie.positionSeconds,
        season: patch.temporada ?? movie.season,
        episode: patch.episodio ?? movie.episode,
      };
      setContinueMovies((current) =>
        dedupeMovies([{ ...nextMovie, progress: Math.max(1, Number(nextMovie.progress || 1)) }, ...current]).slice(0, 16),
      );
      void fetch("/api/progresso", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          movie: nextMovie,
          progresso: patch.progresso,
          posicao_segundos: patch.posicao_segundos,
          temporada: patch.temporada,
          episodio: patch.episodio,
        }),
      }).catch(() => null);
    },
    [],
  );

  const handlePlayerProgress = useCallback(
    (patch: {
      progresso?: number;
      posicao_segundos?: number;
      temporada?: number | null;
      episodio?: number | null;
    }) => {
      const current = playerMovieRef.current;
      if (current) saveProgress(current, patch);
    },
    [saveProgress],
  );

  function startPlayer(payload: Movie) {
    const isTv = mediaKind(payload) === "tv";
    const season = isTv ? payload.season ?? 1 : undefined;
    const episode = isTv ? payload.episode ?? 1 : undefined;
    setSearchOpen(false);
    setSelectedMovie(null);
    setRecapMovie(null);
    setPlayerMovie(payload);
    rememberWatch(payload);
    saveProgress(payload, {
      progresso: Math.max(Number(payload.progress || 0), 5),
      posicao_segundos: payload.positionSeconds || 0,
      temporada: season ?? null,
      episodio: episode ?? null,
    });
    goTo(playerHash(payload, season, episode));
  }

  function openPlayer(movie: Movie, pick?: { season?: number; episode?: number }) {
    if (!canWatch(movie)) {
      showToast("Título sem ID válido para reprodução");
      return;
    }
    const merged = mergeMovieProgress(movie, continueMovies);
    const isTv = mediaKind(merged) === "tv";
    const season = isTv ? pick?.season ?? merged.season ?? 1 : undefined;
    const episode = isTv ? pick?.episode ?? merged.episode ?? 1 : undefined;
    const payload: Movie = { ...merged, season, episode };
    const shouldRecap = isTv && Number(payload.progress || 0) > 0 && ((season || 1) > 1 || (episode || 1) > 1);
    if (shouldRecap) {
      setSearchOpen(false);
      setSelectedMovie(null);
      setRecapMovie(payload);
      return;
    }
    startPlayer(payload);
  }

  async function openFriendActivity(activity: FriendActivity) {
    const id = activity.tmdb_id || activity.id.replace(/^tv:/, "");
    const movie = await resolveTitle(id, activity.kind);
    if (!movie) {
      showToast("Não foi possível abrir este título.");
      return;
    }
    openDetails({ ...movie, season: activity.season || undefined, episode: activity.episode || undefined });
  }

  function createGroupSession(movie: Movie) {
    const url = new URL(window.location.href);
    url.searchParams.set("party", "create");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    openPlayer(movie);
  }

  const syncPlayerEpisode = useCallback((movie: Movie, season: number, episode: number) => {
    const next = { ...movie, season, episode };
    setPlayerMovie(next);
    const hash = playerHash(next, season, episode);
    const target = `#${hash}`;
    if (window.location.hash !== target) {
      window.history.replaceState(null, "", target);
    }
  }, []);

  const closePlayer = useCallback(() => {
    setPlayerMovie(null);
    setSelectedMovie(null);
    const url = new URL(window.location.href);
    url.searchParams.delete("party");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
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

  if (!authChecking && !authUser) {
    if (loginOpen) return <LoginForm />;
    return <BorderCollieForum onPhilpClick={() => setLoginOpen(true)} />;
  }

  if (authChecking || loading) {
    return (
      <main className="flixa-shell">
        <div className="boot-screen">
          <img className="boot-logo" src="/logo-transparent.png" alt="Flixa" />
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

  if (!authUser) return null;

  return (
    <main className="flixa-shell has-mobile-nav">
      {authUser.username ? <SiteIntro name={authUser.nome} /> : null}
      <header className={`flixa-header ${scrolled || searchOpen || view !== "home" ? "is-scrolled" : ""}`}>
        <a className="brand" href="#home" onClick={() => goTo("home")} aria-label="Flixa início">
          <img className="brand-logo" src="/logo-transparent.png" alt="Flixa" />
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
          <a href="#esportes" className={view === "esportes" ? "is-active" : ""} onClick={() => goTo("esportes")}>
            Esportes
          </a>
          <a
            href="#surpreenda-me"
            className={view === "surpreenda-me" ? "is-active" : ""}
            onClick={() => goTo("surpreenda-me")}
          >
            Surpreenda-me
          </a>
          <a
            href="#assistir-em-grupo"
            className={`nav-group-link ${view === "grupo" ? "is-active" : ""}`}
            onClick={() => goTo("assistir-em-grupo")}
          >
            <span aria-hidden="true">◉</span>
            Assistir em grupo
          </a>
          <a
            href="#minha-lista"
            className={view === "lista" ? "is-active" : ""}
            onClick={() => goTo("minha-lista")}
          >
            Minha Lista
            {listMovies.length > 0 ? <em>{listMovies.length}</em> : null}
          </a>
          <a href="#amigos" className={view === "amigos" ? "is-active" : ""} onClick={() => goTo("amigos")}>Amigos</a>
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
              {authUser.administrador ? (
                <a className="header-user-badge" href="/admin">
                  Admin
                </a>
              ) : null}
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
                          {[mediaKind(movie) === "tv" ? "Série" : "Filme", movie.year, movie.genres?.slice(0, 2).join(" · ")]
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

      {view === "esportes" ? (
        <SportsView />
      ) : view === "amigos" ? (
        <FriendsView username={authUser.username || ""} onOpenActivity={(activity) => void openFriendActivity(activity)} />
      ) : view === "grupo" ? (
        <GroupWatchView
          movies={groupCandidates}
          onCreate={createGroupSession}
          onExplore={() => goTo("filmes")}
        />
      ) : view === "lista" ? (
        <section className="list-view" id="minha-lista">
          <div className="list-view-head">
            <div>
              <p className="eyebrow">Sua coleção</p>
              <h1>Minha Lista</h1>
              <p className="hero-description">
                {listMovies.length
                  ? `${listMovies.length} ${listMovies.length === 1 ? "título salvo" : "títulos salvos"} na sua conta.`
                  : "Salve títulos do catálogo para assistir depois. A lista sincroniza com sua conta."}
              </p>
            </div>
            <div className="list-tools">
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
      ) : view === "surpreenda-me" ? (
        <RouletteView
          genres={genres}
          listed={listMovies}
          onWatch={openPlayer}
          onOpen={openDetails}
          onToggleList={toggleList}
          onToast={showToast}
        />
      ) : view === "filmes" || view === "series" ? (
        <section className="list-view" id={view === "series" ? "series" : "filmes"}>
          <div className="list-view-head">
            <div>
              <p className="eyebrow">{activeGenre ? "Categoria" : "Mais famosos"}</p>
              <h1>
                {view === "series" ? "Séries" : "Filmes"}
                {activeGenre ? ` · ${activeGenre.name}` : ""}
              </h1>
              <p className="hero-description">
                {browseTotal
                  ? `${browseTotal.toLocaleString("pt-BR")} ${view === "series" ? "séries" : "filmes"} disponíveis nesta página${
                      activeGenre ? ` em ${activeGenre.name}` : ""
                    } · Catálogo ampliado.`
                  : browseLoading
                    ? "Carregando o catálogo…"
                    : "Nenhum título disponível nesta página."}
              </p>
            </div>
            {browsePages > 1 ? (
              <div className="pager">
                <button
                  className="secondary-action"
                  type="button"
                  disabled={catalogPage <= 1 || browseLoading}
                  onClick={() => goTo(catalogPath(view, catalogPage - 1, genreId))}
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
                  onClick={() => goTo(catalogPath(view, catalogPage + 1, genreId))}
                >
                  Próxima
                </button>
              </div>
            ) : null}
          </div>

          {catalogGenres.length ? (
            <div className="catalog-filters" role="listbox" aria-label="Filtrar por categoria">
              <button
                type="button"
                role="option"
                aria-selected={!genreId}
                className={`catalog-filter ${!genreId ? "is-active" : ""}`}
                onClick={() => goTo(catalogPath(view, 1, null))}
              >
                Todas
              </button>
              {catalogGenres.map((genre) => (
                <button
                  key={genre.id}
                  type="button"
                  role="option"
                  aria-selected={String(genre.id) === genreId}
                  className={`catalog-filter ${String(genre.id) === genreId ? "is-active" : ""}`}
                  onClick={() => goTo(catalogPath(view, 1, String(genre.id)))}
                >
                  {genre.name}
                </button>
              ))}
            </div>
          ) : null}

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
                    onClick={() => goTo(catalogPath(view, catalogPage - 1, genreId))}
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
                    onClick={() => goTo(catalogPath(view, catalogPage + 1, genreId))}
                  >
                    Próxima
                  </button>
                </div>
              ) : null}
            </>
          ) : (
            <div className="empty-state">
              <p>
                {activeGenre
                  ? `Nenhum título em “${activeGenre.name}”`
                  : view === "series"
                    ? "Nenhuma série no catálogo"
                    : "Nenhum filme no catálogo"}
              </p>
              {activeGenre ? (
                <button className="primary-action" type="button" onClick={() => goTo(catalogPath(view, 1, null))}>
                  Ver todas
                </button>
              ) : (
                <a className="primary-action" href="#home" onClick={() => goTo("home")}>
                  Voltar ao início
                </a>
              )}
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
                      href={`#filmes/genero/${genre.id}`}
                      onClick={() => goTo(`filmes/genero/${genre.id}`)}
                    >
                      <span>{genre.name}</span>
                    </a>
                  ))}
                </div>
              </section>
            ) : null}

            {continueMovies.length ? (
              <MovieRow
                title="Continuar assistindo"
                items={continueMovies}
                listed={listMovies}
                onOpen={(movie) => openPlayer(movie)}
                onToggleList={toggleList}
                onRemoveProgress={removeFromContinue}
              />
            ) : recentMovies.length ? (
              <MovieRow
                title="Assistidos recentemente"
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
          movie={mergeMovieProgress(selectedMovie, continueMovies)}
          inList={isListed(listMovies, selectedMovie)}
          listed={listMovies}
          onClose={closeDetails}
          onToggleList={toggleList}
          onWatch={openPlayer}
          onOpen={openDetails}
        />
      ) : null}

      {playerMovie ? (
        <MoviePlayer
          movie={playerMovie}
          onClose={closePlayer}
          onProgress={handlePlayerProgress}
          onEpisodeChange={syncPlayerEpisode}
        />
      ) : null}

      {recapMovie ? (
        <SeriesRecapModal
          movie={recapMovie}
          onContinue={() => startPlayer(recapMovie)}
          onCancel={() => {
            setRecapMovie(null);
            if (/^#(?:filme|serie)\//.test(window.location.hash)) setSelectedMovie(recapMovie);
            const url = new URL(window.location.href);
            if (url.searchParams.get("party") === "create") {
              url.searchParams.delete("party");
              window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
            }
          }}
        />
      ) : null}

      {!authUser.username ? <UsernameSetupModal user={authUser} onComplete={setAuthUser} /> : null}

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
        <a href="#esportes" className={view === "esportes" ? "is-active" : ""} onClick={() => goTo("esportes")}>
          Esportes
        </a>
        <a
          href="#assistir-em-grupo"
          className={view === "grupo" ? "is-active" : ""}
          onClick={() => goTo("assistir-em-grupo")}
        >
          Grupo
        </a>
        <a href="#amigos" className={view === "amigos" ? "is-active" : ""} onClick={() => goTo("amigos")}>Amigos</a>
        <a href="#minha-lista" className={view === "lista" ? "is-active" : ""} onClick={() => goTo("minha-lista")}>
          Lista
          {listMovies.length > 0 ? <em>{listMovies.length}</em> : null}
        </a>
      </nav>
    </main>
  );
}

function shuffleMovies(items: Movie[]) {
  const next = [...items];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [next[index], next[swap]] = [next[swap], next[index]];
  }
  return next;
}

const LOOT_SPIN_MS = 5400;
const LOOT_REVEAL_DELAY_MS = 1100;
const TERROR_GENRE: Genre = { id: 27, name: "Terror" };

function buildRouletteGenreOptions(all: Genre[]) {
  const byId = new Map<number, Genre>();
  for (const genre of all) byId.set(genre.id, genre);
  byId.set(TERROR_GENRE.id, byId.get(TERROR_GENRE.id) ?? TERROR_GENRE);

  const terror = byId.get(TERROR_GENRE.id)!;
  byId.delete(TERROR_GENRE.id);

  const rest = [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  return [{ id: 0, name: "Todos" }, terror, ...rest];
}

function buildIdleStrip(movies: Movie[], min = 28) {
  if (!movies.length) return [];
  const out: Movie[] = [];
  while (out.length < min) out.push(...shuffleMovies(movies));
  return out.slice(0, min);
}

function buildLootReel(candidates: Movie[], winner: Movie, visiblePrefix: Movie[] = []) {
  const pool = candidates.filter((movie) => movieKey(movie) !== movieKey(winner));
  const base = shuffleMovies(pool.length ? pool : [winner]);
  const reel: Movie[] = [];
  while (reel.length < 56) {
    for (const movie of shuffleMovies(base)) {
      if (movieKey(movie) === movieKey(winner)) continue;
      reel.push(movie);
    }
  }
  const landIndex = 38 + Math.floor(Math.random() * 6);
  reel.length = landIndex + 10;
  reel[landIndex] = winner;
  for (let index = 0; index < reel.length; index += 1) {
    if (index === landIndex) continue;
    const prefixMovie = visiblePrefix[index];
    if (prefixMovie && movieKey(prefixMovie) !== movieKey(winner)) {
      reel[index] = prefixMovie;
      continue;
    }
    const filler = base[index % base.length] ?? winner;
    if (movieKey(filler) !== movieKey(winner)) reel[index] = filler;
  }
  return { reel, landIndex };
}

function RouletteView({
  genres: catalogGenres,
  listed,
  onWatch,
  onOpen,
  onToggleList,
  onToast,
}: {
  genres: Genre[];
  listed: Movie[];
  onWatch: (movie: Movie) => void;
  onOpen: (movie: Movie) => void;
  onToggleList: (movie: Movie) => void;
  onToast: (message: string) => void;
}) {
  const [genres, setGenres] = useState<Genre[]>(catalogGenres);
  const [genreId, setGenreId] = useState<number | null>(null);
  const [pool, setPool] = useState<Movie[]>([]);
  const [poolLoading, setPoolLoading] = useState(false);
  const [poolError, setPoolError] = useState<string | null>(null);
  const [pick, setPick] = useState<Movie | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [preparingSpin, setPreparingSpin] = useState(false);
  const [reel, setReel] = useState<Movie[]>([]);
  const [offset, setOffset] = useState(0);
  const [animate, setAnimate] = useState(false);
  const [winnerIndex, setWinnerIndex] = useState<number | null>(null);
  const [revealOpen, setRevealOpen] = useState(false);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [watched, setWatched] = useState<RouletteWatched[]>([]);
  const stripRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const spinEndTimer = useRef<number | null>(null);
  const revealTimer = useRef<number | null>(null);
  const pendingSpinRef = useRef<{ landIndex: number; finalPick: Movie; reel: Movie[] } | null>(null);
  const replenishRef = useRef(false);
  const visibleStripRef = useRef<Movie[]>([]);

  function clearRevealTimer() {
    if (revealTimer.current) {
      window.clearTimeout(revealTimer.current);
      revealTimer.current = null;
    }
  }

  const closeReveal = useCallback(() => {
    if (revealTimer.current) {
      window.clearTimeout(revealTimer.current);
      revealTimer.current = null;
    }
    setRevealOpen(false);
  }, []);

  function resetPickState() {
    clearRevealTimer();
    setRevealOpen(false);
    setPick(null);
    setWinnerIndex(null);
    setReel([]);
    setAnimate(false);
    setOffset(0);
  }

  const activeGenre =
    genreId === 0
      ? { id: 0, name: "Todos" }
      : (genres.find((genre) => genre.id === genreId) ?? null);
  const genreOptions = useMemo(() => buildRouletteGenreOptions(genres), [genres]);
  const skippedKeys = useMemo(() => new Set(skipped), [skipped]);
  const watchedKeys = useMemo(() => new Set(watched.map((item) => movieKey(item))), [watched]);
  const available = useMemo(
    () => pool.filter((movie) => !skippedKeys.has(movieKey(movie)) && !watchedKeys.has(movieKey(movie))),
    [pool, skippedKeys, watchedKeys],
  );

  useEffect(() => {
    migrateRouletteStorage();
    setSkipped(readRouletteSkipped());
    setWatched(readRouletteWatched());
    return () => {
      if (spinEndTimer.current) window.clearTimeout(spinEndTimer.current);
      if (revealTimer.current) window.clearTimeout(revealTimer.current);
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/movies?genres=1&kind=movie", { cache: "no-store", signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { genres?: Genre[] } | null) => {
        const list = Array.isArray(data?.genres) ? data.genres : [];
        if (list.length) setGenres(list);
        else if (catalogGenres.length) setGenres(catalogGenres);
      })
      .catch(() => {
        if (!controller.signal.aborted && catalogGenres.length) setGenres(catalogGenres);
      });
    return () => controller.abort();
  }, [catalogGenres]);

  useEffect(() => {
    if (genreId == null) {
      setPool([]);
      resetPickState();
      setPoolError(null);
      return;
    }

    const controller = new AbortController();
    setPoolLoading(true);
    setPoolError(null);
    resetPickState();
    setSpinning(false);
    setPreparingSpin(false);
    replenishRef.current = false;
    pendingSpinRef.current = null;
    if (spinEndTimer.current) {
      window.clearTimeout(spinEndTimer.current);
      spinEndTimer.current = null;
    }

    const genreParam = genreId === 0 ? "all" : String(genreId);
    fetch(`/api/movies?genre=${encodeURIComponent(genreParam)}&kind=movie&roulette=1&pages=5`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { movies?: Movie[]; error?: string | null } | null) => {
        const movies = asMovieList(data?.movies);
        setPool(movies);
        if (!movies.length) setPoolError(data?.error || "Nenhum filme encontrado neste gênero.");
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setPool([]);
          setPoolError("Não foi possível carregar os top filmes deste gênero.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setPoolLoading(false);
      });

    return () => controller.abort();
  }, [genreId]);

  useEffect(() => {
    if (genreId == null || poolLoading || available.length >= 14 || replenishRef.current) return;
    replenishRef.current = true;
    const genreParam = genreId === 0 ? "all" : String(genreId);
    fetch(`/api/movies?genre=${encodeURIComponent(genreParam)}&kind=movie&roulette=1&pages=8`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { movies?: Movie[] } | null) => {
        const extra = asMovieList(data?.movies);
        if (!extra.length) return;
        setPool((current) => dedupeMovies([...current, ...extra]));
      })
      .finally(() => {
        replenishRef.current = false;
      });
  }, [genreId, poolLoading, available.length]);

  function persistSkipped(next: string[]) {
    setSkipped(next);
    writeRouletteSkipped(next);
  }

  function persistWatched(next: RouletteWatched[]) {
    setWatched(next);
    writeRouletteWatched(next);
  }

  function skipMovie(movie: Movie) {
    const key = movieKey(movie);
    const next = [...new Set([key, ...skipped])].slice(0, 500);
    persistSkipped(next);
    return next;
  }

  function markWatched(movie: Movie) {
    const entry: RouletteWatched = {
      ...movie,
      kind: "movie",
      watchedAt: new Date().toISOString(),
      genreName: activeGenre?.name || movie.genres?.[0],
    };
    const next = [entry, ...watched.filter((item) => movieKey(item) !== movieKey(movie))].slice(0, 200);
    persistWatched(next);
    return next;
  }

  function pickRandom(from: Movie[]) {
    if (!from.length) return null;
    return from[Math.floor(Math.random() * from.length)] ?? null;
  }

  function cardStep() {
    const first = stripRef.current?.querySelector<HTMLElement>(".roleta-loot-card");
    if (!first) return 116;
    const style = window.getComputedStyle(stripRef.current!);
    const gap = Number.parseFloat(style.columnGap || style.gap || "10") || 10;
    return first.getBoundingClientRect().width + gap;
  }

  function centerOffset(landIndex: number) {
    const viewport = viewportRef.current;
    if (!viewport) return landIndex * cardStep();
    const step = cardStep();
    return landIndex * step - (viewport.clientWidth / 2 - step / 2);
  }

  async function spin(options?: { excludeKey?: string; skipOverride?: string[] }) {
    if (genreId == null || poolLoading || spinning || preparingSpin) return;

    const skipKeys = new Set(options?.skipOverride ?? skipped);
    const excludedWatched = new Set(watched.map((item) => movieKey(item)));
    if (options?.excludeKey) skipKeys.add(options.excludeKey);
    const candidates = pool.filter(
      (movie) => !skipKeys.has(movieKey(movie)) && !excludedWatched.has(movieKey(movie)),
    );

    if (!candidates.length) {
      resetPickState();
      onToast("Não há mais filmes neste gênero. Restaure o sorteio ou troque o gênero.");
      return;
    }

    const finalPick = pickRandom(candidates);
    if (!finalPick) return;

    const built = buildLootReel(candidates, finalPick, visibleStripRef.current.slice(0, 12));
    pendingSpinRef.current = { landIndex: built.landIndex, finalPick, reel: built.reel };
    clearRevealTimer();
    setRevealOpen(false);
    setPick(null);
    setWinnerIndex(null);
    setSpinning(false);
    setPreparingSpin(true);
    setAnimate(false);

    await preloadPosterImages(built.reel);

    if (genreId == null || !pendingSpinRef.current) return;

    setReel(pendingSpinRef.current.reel);
    setOffset(0);
    setPreparingSpin(false);
    setSpinning(true);
  }

  useLayoutEffect(() => {
    if (!spinning || preparingSpin || !pendingSpinRef.current || !reel.length) return;

    const { landIndex, finalPick } = pendingSpinRef.current;
    const target = centerOffset(landIndex);

    if (spinEndTimer.current) window.clearTimeout(spinEndTimer.current);

    const frame = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        setAnimate(true);
        setOffset(Math.max(0, target));
      });
    });

    spinEndTimer.current = window.setTimeout(() => {
      setWinnerIndex(landIndex);
      setPick(finalPick);
      setSpinning(false);
      pendingSpinRef.current = null;
      spinEndTimer.current = null;
      clearRevealTimer();
      revealTimer.current = window.setTimeout(() => {
        setRevealOpen(true);
        revealTimer.current = null;
      }, LOOT_REVEAL_DELAY_MS);
    }, LOOT_SPIN_MS);

    return () => {
      window.cancelAnimationFrame(frame);
      if (spinEndTimer.current) {
        window.clearTimeout(spinEndTimer.current);
        spinEndTimer.current = null;
      }
    };
  }, [reel, spinning, preparingSpin]);

  useLayoutEffect(() => {
    if (!pick || spinning || preparingSpin || !reel.length || winnerIndex == null) return;
    setAnimate(false);
    setOffset(Math.max(0, centerOffset(winnerIndex)));
  }, [pick, reel, winnerIndex, spinning, preparingSpin]);

  function handleAlreadySeen() {
    if (!pick || spinning || preparingSpin) return;
    const skippedMovie = pick;
    const next = skipMovie(skippedMovie);
    resetPickState();
    onToast(`Removido do sorteio · ${skippedMovie.title}`);
    window.setTimeout(() => spin({ skipOverride: next, excludeKey: movieKey(skippedMovie) }), 180);
  }

  function handleWatch() {
    if (!pick || spinning || preparingSpin) return;
    const movie = pick;
    markWatched(movie);
    resetPickState();
    onWatch(movie);
  }

  const lootBusy = spinning || preparingSpin;
  const showCenterSpin = !poolLoading && !pick && !lootBusy && Boolean(available.length);
  const showCenterLoading = preparingSpin;
  const showReel = reel.length > 0 && (spinning || Boolean(pick));
  const idleStrip = useMemo(() => buildIdleStrip(available), [available]);
  visibleStripRef.current = idleStrip;

  const previewPosters: Movie[] = showReel ? reel : idleStrip;

  function clearWatched() {
    persistWatched([]);
    onToast("Histórico limpo");
  }

  function clearSkipped() {
    persistSkipped([]);
    onToast("Filmes restaurados no sorteio");
  }

  function removeFromHistory(movie: Movie) {
    persistWatched(watched.filter((item) => movieKey(item) !== movieKey(movie)));
  }

  useEffect(() => {
    if (!available.length || lootBusy || poolLoading) return;
    void preloadPosterImages(idleStrip);
  }, [available, idleStrip, lootBusy, poolLoading]);

  return (
    <section className="list-view roleta-view" id="surpreenda-me">
      <div className="list-view-head">
        <div>
          <h1>Surpreenda-me</h1>
          <p className="hero-description">
            Escolha um gênero e gire. Se já viu o filme sorteado, use &quot;Já vi&quot; para tirá-lo do sorteio — assistindo, ele vai para o histórico.
          </p>
        </div>
        <div className="list-tools">
          {skipped.length ? (
            <button className="secondary-action" type="button" onClick={clearSkipped}>
              Restaurar sorteio
            </button>
          ) : null}
          {watched.length ? (
            <button className="secondary-action" type="button" onClick={clearWatched}>
              Limpar histórico
            </button>
          ) : null}
        </div>
      </div>

      <div className="roleta-genres" role="listbox" aria-label="Gêneros para sortear">
        {genreOptions.map((genre) => (
          <button
            key={genre.id}
            type="button"
            role="option"
            aria-selected={genre.id === genreId}
            className={`roleta-genre ${genre.id === genreId ? "is-active" : ""}`}
            onClick={() => setGenreId(genre.id)}
            disabled={lootBusy}
          >
            {genre.name}
          </button>
        ))}
      </div>

      {genreId == null ? (
        <div className="roleta-empty">
          <p>Escolha um gênero (ou Todos) para começar.</p>
        </div>
      ) : (
        <div className="roleta-stage">
          <div
            className={`roleta-loot ${spinning ? "is-spinning" : ""} ${pick ? "has-pick" : ""} ${!spinning && !pick && !poolLoading ? "is-idle" : ""}`}
          >
            <div className="roleta-loot-shell">
              <div className="roleta-loot-frame">
                <span className="roleta-loot-pointer" aria-hidden="true" />
                <div className="roleta-loot-fade roleta-loot-fade--left" aria-hidden="true" />
                <div className="roleta-loot-fade roleta-loot-fade--right" aria-hidden="true" />
                <div className="roleta-loot-viewport" ref={viewportRef}>
                  {poolLoading ? (
                    <div className="roleta-loot-loading">
                      {Array.from({ length: 10 }).map((_, index) => (
                        <span key={index} className="skeleton-poster roleta-loot-skel" />
                      ))}
                    </div>
                  ) : (
                    <div
                      className={`roleta-loot-strip ${animate ? "is-animated" : ""} ${pick && !lootBusy ? "is-landed" : ""}`}
                      ref={stripRef}
                      style={{
                        transform: `translate3d(${-offset}px, 0, 0)`,
                        transitionDuration: animate ? `${LOOT_SPIN_MS}ms` : "0ms",
                      }}
                    >
                      {previewPosters.length ? (
                        previewPosters.map((movie, index) => {
                          const src = imageSrc(movie.poster);
                          const isWinner = Boolean(pick && movieKey(pick) === movieKey(movie) && !lootBusy);
                          return (
                            <div
                              key={`${movieKey(movie)}-${index}`}
                              className={`roleta-loot-card ${isWinner ? "is-winner" : ""}`}
                            >
                              {src ? <img src={src} alt="" draggable={false} decoding="async" /> : <span>?</span>}
                            </div>
                          );
                        })
                      ) : (
                        Array.from({ length: 10 }).map((_, index) => (
                          <div key={`empty-${index}`} className="roleta-loot-card">
                            <span>?</span>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>

                {showCenterLoading ? (
                  <div className="roleta-loot-center" aria-live="polite">
                    <button className="roleta-spin-btn" type="button" disabled>
                      Carregando…
                    </button>
                  </div>
                ) : showCenterSpin ? (
                  <div className="roleta-loot-center">
                    <button
                      className="roleta-spin-btn"
                      type="button"
                      onClick={() => void spin()}
                      disabled={!available.length || poolLoading}
                    >
                      Girar
                    </button>
                  </div>
                ) : null}
              </div>
            </div>

            {poolError || (pick && !revealOpen) || (!poolLoading && !lootBusy && !available.length) ? (
              <div className="roleta-loot-panel">
                {poolError ? (
                  <h2>{poolError}</h2>
                ) : pick ? (
                  <>
                    <h2>{pick.title}</h2>
                    <div className="meta-line">
                      {movieMeta(pick).map((item) => (
                        <span key={String(item)}>{item}</span>
                      ))}
                    </div>
                    <div className="roleta-actions">
                      <button className="primary-action" type="button" onClick={() => setRevealOpen(true)}>
                        Ver resultado
                      </button>
                      <button
                        className="secondary-action"
                        type="button"
                        onClick={() => void spin({ excludeKey: movieKey(pick) })}
                        disabled={lootBusy}
                      >
                        Girar de novo
                      </button>
                    </div>
                  </>
                ) : (
                  <h2>Sem filmes neste gênero</h2>
                )}
              </div>
            ) : null}
          </div>
        </div>
      )}

      {revealOpen && pick ? (
        <RouletteRevealModal
          movie={pick}
          listed={listed}
          onClose={closeReveal}
          onWatch={handleWatch}
          onAlreadySeen={handleAlreadySeen}
          onSpinAgain={() => {
            closeReveal();
            void spin({ excludeKey: movieKey(pick) });
          }}
          onOpenDetails={() => {
            closeReveal();
            onOpen(pick);
          }}
          onToggleList={() => onToggleList(pick)}
        />
      ) : null}

      {watched.length ? (
      <section className="roleta-history" aria-label="Histórico do Surpreenda-me">
        <div className="roleta-history-head">
          <h2>Assistidos</h2>
        </div>
          <div className="roleta-history-rail">
            {watched.map((movie) => {
              const src = imageSrc(movie.poster);
              return (
                <article key={`${movieKey(movie)}-${movie.watchedAt}`} className="roleta-history-card">
                  <button type="button" className="roleta-history-poster" onClick={() => onOpen(movie)}>
                    {src ? <img src={src} alt="" loading="lazy" /> : <span>{movie.title.slice(0, 1)}</span>}
                  </button>
                  <div className="roleta-history-meta">
                    <strong>{movie.title}</strong>
                    <small>
                      {[movie.genreName || movie.genres?.[0], movie.year].filter(Boolean).join(" · ")}
                    </small>
                    <div className="roleta-history-actions">
                      <button type="button" className="text-link" onClick={() => onWatch(movie)}>
                        Assistir
                      </button>
                      <button type="button" className="text-link" onClick={() => removeFromHistory(movie)}>
                        Remover
                      </button>
                      <button
                        type="button"
                        className={`text-link ${isListed(listed, movie) ? "is-on" : ""}`}
                        onClick={() => onToggleList(movie)}
                      >
                        {isListed(listed, movie) ? "Na lista" : "Lista"}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
      </section>
      ) : null}
    </section>
  );
}

function RouletteRevealModal({
  movie,
  listed,
  onClose,
  onWatch,
  onAlreadySeen,
  onSpinAgain,
  onOpenDetails,
  onToggleList,
}: {
  movie: Movie;
  listed: Movie[];
  onClose: () => void;
  onWatch: () => void;
  onAlreadySeen: () => void;
  onSpinAgain: () => void;
  onOpenDetails: () => void;
  onToggleList: () => void;
}) {
  const poster = imageSrc(movie.poster, "w780");
  const backdrop = imageSrc(movie.backdrop || movie.poster, "w1280");
  const inList = isListed(listed, movie);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div
      className="roleta-reveal"
      role="dialog"
      aria-modal="true"
      aria-label={`Filme sorteado: ${movie.title}`}
      onClick={onClose}
    >
      <div className="roleta-reveal-bg" aria-hidden="true">
        {backdrop ? <img src={backdrop} alt="" /> : null}
      </div>
      <div className="roleta-reveal-panel" onClick={(event) => event.stopPropagation()}>
        <button className="close-button" type="button" onClick={onClose} aria-label="Fechar">
          ×
        </button>
        <div className="roleta-reveal-beam" aria-hidden="true" />
        <div className="roleta-reveal-poster">
          {poster ? <img src={poster} alt={`Pôster de ${movie.title}`} /> : <span>{movie.title.slice(0, 1)}</span>}
        </div>
        <div className="roleta-reveal-copy">
          <p className="roleta-reveal-label">Filme sorteado</p>
          <h2>{movie.title}</h2>
          <div className="meta-line">
            {movieMeta(movie).map((item) => (
              <span key={String(item)}>{item}</span>
            ))}
          </div>
          {movie.description ? <p className="roleta-reveal-synopsis">{movie.description}</p> : null}
          <div className="roleta-reveal-actions">
            <button className="primary-action" type="button" onClick={onWatch} disabled={!canWatch(movie)}>
              Assistir
            </button>
            <button className="secondary-action" type="button" onClick={onAlreadySeen}>
              Já vi
            </button>
            <button className="secondary-action" type="button" onClick={onSpinAgain}>
              Girar de novo
            </button>
            <button className={`secondary-action ${inList ? "is-on" : ""}`} type="button" onClick={onToggleList}>
              {inList ? "Na lista" : "Minha Lista"}
            </button>
            <button className="text-link" type="button" onClick={onOpenDetails}>
              Ver detalhes
            </button>
          </div>
        </div>
      </div>
    </div>
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

function GroupWatchView({
  movies,
  onCreate,
  onExplore,
}: {
  movies: Movie[];
  onCreate: (movie: Movie) => void;
  onExplore: () => void;
}) {
  return (
    <section className="list-view group-watch-view" id="assistir-em-grupo">
      <div className="list-view-head">
        <div>
          <p className="eyebrow">Flixa Party</p>
          <h1>Assistir em grupo</h1>
          <p className="hero-description">
            Todo mundo no mesmo segundo. Você cria a sala, envia o link e controla play, pausa e avanço para o grupo inteiro.
          </p>
        </div>
        <button className="secondary-action" type="button" onClick={onExplore}>Explorar catálogo</button>
      </div>

      <div className="group-watch-guide" aria-label="Como criar uma sessão">
        <div className="group-watch-status"><span /> Salas em tempo real · até 12 pessoas</div>
        <ol>
          <li><b>1</b><span><strong>Escolha um título</strong><small>Filme ou episódio.</small></span></li>
          <li><b>2</b><span><strong>Copie o convite</strong><small>A sala abre automaticamente.</small></span></li>
          <li><b>3</b><span><strong>Assista junto</strong><small>O anfitrião controla para todos.</small></span></li>
        </ol>
      </div>

      <div className="group-watch-picker-head">
        <div>
          <p className="eyebrow">Começar agora</p>
          <h2>O que vocês vão assistir?</h2>
        </div>
      </div>

      {movies.length ? (
        <div className="poster-grid">
          {movies.map((movie) => (
            <MovieCard
              key={movieKey(movie)}
              movie={movie}
              inList={false}
              onOpen={onCreate}
              onToggleList={onCreate}
              actionLabel="Criar sala"
            />
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <p>Nenhum título disponível para criar uma sala agora.</p>
          <button className="primary-action" type="button" onClick={onExplore}>Explorar catálogo</button>
        </div>
      )}
    </section>
  );
}

function MovieRow({
  title,
  items,
  listed,
  listId,
  onOpen,
  onToggleList,
  onRemoveProgress,
  onSeeAll,
}: {
  title: string;
  items: Movie[];
  listed: Movie[];
  listId?: string;
  onOpen: (movie: Movie) => void;
  onToggleList: (movie: Movie) => void;
  onRemoveProgress?: (movie: Movie) => void;
  onSeeAll?: () => void;
}) {
  const railRef = useRef<HTMLDivElement>(null);
  const [extra, setExtra] = useState<Movie[]>([]);
  const [page, setPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);

  const allItems = useMemo(() => dedupeMovies([...items, ...extra]), [items, extra]);

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;

    const desktop = window.matchMedia("(min-width: 761px)");
    const onWheel = (event: WheelEvent) => {
      if (!desktop.matches) return;
      const usingShift = event.shiftKey;
      const mostlyHorizontal = Math.abs(event.deltaX) > Math.abs(event.deltaY);
      if (!usingShift && !mostlyHorizontal) return;

      const maxScroll = rail.scrollWidth - rail.clientWidth;
      if (maxScroll <= 0) return;

      const delta = usingShift && Math.abs(event.deltaY) >= Math.abs(event.deltaX)
        ? event.deltaY
        : event.deltaX || event.deltaY;
      if (!delta) return;

      const next = Math.min(maxScroll, Math.max(0, rail.scrollLeft + delta));
      if (next === rail.scrollLeft) return;
      event.preventDefault();
      rail.scrollLeft = next;
    };

    rail.addEventListener("wheel", onWheel, { passive: false });
    return () => rail.removeEventListener("wheel", onWheel);
  }, []);

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
            onRemoveProgress={onRemoveProgress}
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
  onRemoveProgress,
  actionLabel,
}: {
  movie: Movie;
  inList: boolean;
  onOpen: (movie: Movie) => void;
  onToggleList: (movie: Movie) => void;
  onRemoveProgress?: (movie: Movie) => void;
  actionLabel?: string;
}) {
  const src = imageSrc(movie.poster);

  return (
    <article className="movie-card">
      <div className="poster-wrap">
        <button className="poster-hit" type="button" onClick={() => onOpen(movie)}>
          <span className="poster-frame">
            <ResilientImage
              sources={[src, imageSrc(movie.backdrop, "w342")]}
              alt={`Pôster de ${movie.title}`}
              loading="lazy"
              fallback={<span className="poster-fallback">{movie.title}</span>}
            />
            {formatScore(movie.rating) ? <span className="score-badge">{formatScore(movie.rating)}</span> : null}
          </span>
        </button>
        {onRemoveProgress ? (
          <button
            className="card-remove-progress"
            type="button"
            aria-label={`Remover ${movie.title} de Continuar assistindo`}
            onClick={() => onRemoveProgress(movie)}
          >
            <span aria-hidden="true">×</span> Remover
          </button>
        ) : null}
        <button
          className={`card-list-btn ${inList ? "is-on" : ""}`}
          type="button"
          onClick={() => onToggleList(movie)}
        >
          {actionLabel ?? (inList ? "Remover da lista" : "Adicionar a Lista")}
        </button>
      </div>
      <div className="card-meta">
        <strong>{movie.title}</strong>
        <div className="card-tags">
          {mediaKind(movie) === "tv" ? <span className="card-kind">Série</span> : null}
          {tvProgressLabel(movie) ? <span className="card-progress">{tvProgressLabel(movie)}</span> : null}
          {movie.genres?.[0] ? <span className="card-genre">{movie.genres.slice(0, 2).join(" · ")}</span> : null}
          {movie.year ? <span className="card-year">{movie.year}</span> : null}
        </div>
      </div>
    </article>
  );
}

function TvEpisodePicker({
  movie,
  onWatch,
}: {
  movie: Movie;
  onWatch: (movie: Movie, pick?: { season?: number; episode?: number }) => void;
}) {
  const savedSeason = Math.max(1, movie.season || 1);
  const savedEpisode = Math.max(1, movie.episode || 1);
  const hasProgress = Number(movie.progress || 0) > 0 && movie.season && movie.episode;

  const [season, setSeason] = useState(savedSeason);
  const [seasons, setSeasons] = useState<TvSeasonInfo[]>([]);
  const [episodes, setEpisodes] = useState<TvEpisodeInfo[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/movies?id=${encodeURIComponent(titleId(movie))}&kind=tv`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { seasons?: TvSeasonInfo[] } | null) => {
        const list = Array.isArray(data?.seasons) ? data.seasons.filter((item) => item.season_number > 0) : [];
        setSeasons(list);
        if (list.length > 0 && !list.some((item) => item.season_number === season)) {
          setSeason(list[0].season_number);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setSeasons([]);
      });
    return () => controller.abort();
  }, [movie.id, movie.tmdb_id]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    fetch(`/api/movies?id=${encodeURIComponent(titleId(movie))}&kind=tv&season=${season}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { episodes?: TvEpisodeInfo[] } | null) => {
        const list = Array.isArray(data?.episodes) ? data.episodes.filter((item) => item.episode_number > 0) : [];
        setEpisodes(list);
      })
      .catch(() => {
        if (!controller.signal.aborted) setEpisodes([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [movie.id, movie.tmdb_id, season]);

  function watchEpisode(episodeNumber: number) {
    onWatch(movie, { season, episode: episodeNumber });
  }

  return (
    <section className="tv-catalog" aria-label="Episódios">
      <div className="tv-catalog-head">
        <h3>Episódios</h3>
        {hasProgress ? (
          <button
            className="text-link"
            type="button"
            onClick={() => onWatch(movie, { season: savedSeason, episode: savedEpisode })}
          >
            Continuar {tvProgressLabel(movie)}
          </button>
        ) : null}
      </div>

      {seasons.length ? (
        <div className="tv-season-tabs" role="tablist" aria-label="Temporadas">
          {seasons.map((item) => (
            <button
              key={item.season_number}
              type="button"
              role="tab"
              aria-selected={item.season_number === season}
              className={item.season_number === season ? "is-active" : ""}
              onClick={() => setSeason(item.season_number)}
            >
              {item.name || `Temporada ${item.season_number}`}
            </button>
          ))}
        </div>
      ) : null}

      {loading ? <p className="tv-catalog-status">Carregando episódios…</p> : null}

      {!loading && episodes.length ? (
        <div className="tv-episode-grid">
          {episodes.map((item) => {
            const isCurrent = hasProgress && savedSeason === season && savedEpisode === item.episode_number;
            const still = imageSrc(item.still, "w780");
            const activeSeason = seasons.find((item) => item.season_number === season);
            return (
              <button
                key={item.episode_number}
                type="button"
                className={`tv-episode-card ${isCurrent ? "is-current" : ""}`}
                onClick={() => watchEpisode(item.episode_number)}
              >
                <span className="tv-episode-thumb">
                  <ResilientImage
                    key={`${season}-${item.episode_number}`}
                    sources={[
                      still,
                      imageSrc(movie.backdrop, "w780"),
                      imageSrc(activeSeason?.poster, "w780"),
                      imageSrc(movie.poster, "w780"),
                    ]}
                    alt=""
                    loading="lazy"
                    fallback={<span>E{item.episode_number}</span>}
                  />
                  {isCurrent && Number(movie.progress || 0) > 0 ? (
                    <span className="tv-episode-progress" style={{ width: `${Math.min(100, Number(movie.progress))}%` }} />
                  ) : null}
                </span>
                <span className="tv-episode-copy">
                  <strong>
                    {item.episode_number}. {item.name}
                  </strong>
                  {item.runtime ? <small>{item.runtime} min</small> : null}
                  {item.overview ? <p>{item.overview}</p> : null}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}

      {!loading && !episodes.length ? (
        <p className="tv-catalog-status">Nenhum episódio encontrado para esta temporada.</p>
      ) : null}
    </section>
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
  onWatch: (movie: Movie, pick?: { season?: number; episode?: number }) => void;
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
  const watchLabel = Number(details.progress || 0) > 0 ? "Continuar assistindo" : "Assistir agora";

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
            ) : (
              <ResilientImage
                sources={[backdrop, imageSrc(details.poster, "w1280")]}
                alt=""
                fallback={<div className="details-art-fallback" aria-hidden="true" />}
              />
            )}
          </div>
          <div className="details-body">
            <ResilientImage
              className="details-poster"
              sources={[poster, imageSrc(details.backdrop, "w780")]}
              alt={`Pôster de ${details.title}`}
              fallback={<div className="details-poster details-poster--fallback">{details.title}</div>}
            />
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
                  <button
                    className="primary-action"
                    type="button"
                    onClick={() =>
                      onWatch(details)
                    }
                  >
                    {watchLabel}
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
          {mediaKind(details) === "tv" ? <TvEpisodePicker movie={details} onWatch={onWatch} /> : null}
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
  ".player-view, .player-chrome, .player-bar, .player-fs-dock, .player-actions, .player-server-menu, .player-episode-drawer, .toast, .flixa-header, .movie-card, .details-panel, .search-panel, .flixa-shell, #__next, [data-flixa]";

function isAllowedPlayerFrame(src: string) {
  return /pipocacine\.lat|cdn-embed\.com|yapgrid\.com|screenscape\.me|play\.xpass\.top|cinesrc\.st|unlimplay\.com|vidsrc\.wiki|videasy\.(?:net|to)|autoembed\.co|vidphantom\.com|embed-api\.stream|iembed\.codeera\.dev|pomfy\.stream|megaembed\.com|superflixapi\.sbs|warezcdn\.lat|redeflixapi\.store|betterflix\.cfd|myembed\.biz|themoviedb|image\.tmdb|youtube|googlevideo/.test(src);
}

function isOverlayAd(node: Element) {
  if (!(node instanceof HTMLElement)) return false;
  if (node.closest(PLAYER_UI_SELECTOR)) return false;
  if (
    node.classList.contains("player-view") ||
    node.classList.contains("player-chrome") ||
    node.classList.contains("video-stage") ||
    node.classList.contains("flixa-shell")
  ) {
    return false;
  }

  const playerOpen = document.body.classList.contains("player-open");
  const style = node.getAttribute("style") || "";
  const text = (node.textContent || "").replace(/\s+/g, " ").trim();
  const className = typeof node.className === "string" ? node.className : "";

  if (playerOpen && node.parentElement === document.body) {
    if (node instanceof HTMLAnchorElement) return true;
    if (node instanceof HTMLIFrameElement && !node.classList.contains("video-stage")) return true;
    if (node instanceof HTMLImageElement) return true;
    if (/position:\s*(fixed|absolute)/i.test(style) || /z-index:\s*\d{3,}/i.test(style)) return true;
    if (/embedmovies|superflix|warez|cdn-embed|popads|exoclick|juicyads/i.test(`${text} ${className}`)) return true;
    // Badges/pill flutuantes injetados no body pelo embed
    if (node.childElementCount <= 3 && text.length > 0 && text.length < 80) {
      if (/embed|ads?|anúncios|premium|claim|congratulations|jackpot/i.test(text)) return true;
    }
  }

  if (node instanceof HTMLIFrameElement && !node.classList.contains("video-stage") && !node.classList.contains("trailer-frame")) {
    const src = `${node.src || ""} ${node.getAttribute("src") || ""}`.toLowerCase();
    if (!src.trim() || src.includes("about:blank")) return playerOpen;
    if (!isAllowedPlayerFrame(src)) {
      if (playerOpen) return true;
      if (/aichouphaugn|popads|exoclick|juicyads|propeller|doubleclick|adsystem|adsterra|tsyndicate|oumaxi|pushground|pushnami|embedmovies/.test(src)) {
        return true;
      }
    }
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
    if (target.closest(".player-chrome, .player-bar, .player-fs-dock, .player-server-menu, .player-episode-drawer, .back-button, .video-stage, .player-view")) {
      return;
    }

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
  const timer = window.setInterval(() => scrubOverlayAds(), 200);

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
  theme: PlayerTheme;
  src: string;
  priority?: number;
};

const PLAYER_PREFERRED_SERVER_KEY = "flixa-player-preferred-server-v2";

function readPreferredPlayerServer() {
  if (typeof window === "undefined") return "";
  try {
    const value = window.localStorage.getItem(PLAYER_PREFERRED_SERVER_KEY) ?? "";
    return /^[a-z0-9-]{1,64}$/i.test(value) ? value : "";
  } catch {
    return "";
  }
}

function writePreferredPlayerServer(serverId: string) {
  try {
    if (serverId) window.localStorage.setItem(PLAYER_PREFERRED_SERVER_KEY, serverId);
    else window.localStorage.removeItem(PLAYER_PREFERRED_SERVER_KEY);
  } catch {
    // O player continua funcionando quando o armazenamento está bloqueado.
  }
}

type AdditionalPlayerSource = {
  id: string;
  name: string;
  theme: PlayerTheme;
  movieUrl: (tmdbId: string) => string;
  tvUrl: (tmdbId: string, season: number, episode: number) => string;
};

const ADDITIONAL_PLAYER_SOURCES: AdditionalPlayerSource[] = [
  { id: "pipocacine", name: "PipocaCine", theme: "rose", movieUrl: (id) => `https://pipocacine.lat/embed/${id}`, tvUrl: (id, season, episode) => `https://pipocacine.lat/embed/${id}/${season}/${episode}` },
  { id: "cdn-embed", name: "CDN Brasil", theme: "emerald", movieUrl: (id) => `https://cdn-embed.com/filme/${id}`, tvUrl: (id, season, episode) => `https://cdn-embed.com/serie/${id}/${season}/${episode}` },
  { id: "screenscape", name: "ScreenScape PT", theme: "violet", movieUrl: (id) => `https://screenscape.me/embed?tmdb=${id}&type=movie&lan=por`, tvUrl: (id, season, episode) => `https://screenscape.me/embed?tmdb=${id}&type=tv&s=${season}&e=${episode}&lan=por` },
  { id: "unlimplay", name: "UnlimPlay", theme: "rose", movieUrl: (id) => `https://unlimplay.com/f/embed/movie/${id}`, tvUrl: (id, season, episode) => `https://unlimplay.com/f/embed/tv/${id}/${season}/${episode}` },
  { id: "redeflix", name: "RedeFlix Brasil", theme: "rose", movieUrl: (id) => `https://redeflixapi.store/filme/${id}`, tvUrl: (id, season, episode) => `https://redeflixapi.store/serie/${id}/${season}/${episode}` },
  { id: "betterflix", name: "BetterFlix Brasil", theme: "gold", movieUrl: (id) => `https://betterflix.cfd/api/player?id=${id}&type=movie`, tvUrl: (id, season, episode) => `https://betterflix.cfd/api/player?id=${id}&type=tv&season=${season}&episode=${episode}` },
  { id: "embedmovies", name: "EmbedMovies Brasil", theme: "violet", movieUrl: (id) => `https://myembed.biz/filme/${id}`, tvUrl: (id, season, episode) => `https://myembed.biz/serie/${id}/${season}/${episode}` },
  { id: "superflix", name: "SuperFlix Brasil", theme: "gold", movieUrl: (id) => `https://superflixapi.sbs/filme/${id}`, tvUrl: (id, season, episode) => `https://superflixapi.sbs/serie/${id}/${season}/${episode}` },
  { id: "warezcdn", name: "WarezCDN Brasil", theme: "emerald", movieUrl: (id) => `https://warezcdn.lat/filme/${id}`, tvUrl: (id, season, episode) => `https://warezcdn.lat/serie/${id}/${season}/${episode}` },
  { id: "megaembed", name: "MegaEmbed Dublado", theme: "cyan", movieUrl: (id) => `https://megaembed.com/embed/${id}`, tvUrl: (id, season, episode) => `https://megaembed.com/embed/${id}/${season}/${episode}` },
];

function withSuperflixFlags(url: string, isTv: boolean) {
  const base = url.split("#")[0];
  const flags = ["noLink", "transparent"];
  if (isTv) flags.push("noEpList");
  return `${base}#${flags.join("#")}`;
}

function buildPlayerSources(
  movie: Movie,
  season?: number,
  episode?: number,
  disabledServerIds: Set<string> = new Set(),
): PlayerSource[] {
  const imdbId = movie.imdb_id && movie.imdb_id !== "N/A" ? movie.imdb_id : (movie.id.startsWith("tt") ? movie.id : "");
  const tmdbId = movie.tmdb_id && movie.tmdb_id !== "N/A" ? movie.tmdb_id : titleId(movie);
  const kind = mediaKind(movie);
  const isTv = kind === "tv";
  const path = isTv ? "serie" : "filme";
  const episodeSuffix = isTv && season && episode ? `/${season}/${episode}` : "";
  const fallbackId = /^\d+$/.test(tmdbId) ? tmdbId : (/^tt\d+$/i.test(imdbId) ? imdbId : "");
  const sources: PlayerSource[] = [];

  const episodePath = `${season ?? 1}/${episode ?? 1}`;
  const episodeDashPath = `${season ?? 1}-${episode ?? 1}`;
  const tmdbOnlyId = /^\d+$/.test(tmdbId) ? tmdbId : "";

  // Fontes independentes verificadas em filme e episódio. Elas ficam antes
  // dos provedores legados para que uma origem ativa seja aberta por padrão.
  if (tmdbOnlyId) {
    sources.push(
      {
        id: "pomfy",
        name: "Pomfy",
        theme: "cyan",
        src: isTv
          ? `https://api.pomfy.stream/serie/${tmdbOnlyId}/${episodePath}`
          : `https://api.pomfy.stream/filme/${tmdbOnlyId}`,
      },
      {
        id: "pipocacine",
        name: "PipocaCine",
        theme: "rose",
        src: isTv
          ? `https://pipocacine.lat/embed/${tmdbOnlyId}/${episodePath}`
          : `https://pipocacine.lat/embed/${tmdbOnlyId}`,
      },
      {
        id: "vidsrc-wiki",
        name: "VidSrc Wiki",
        theme: "violet",
        src: isTv
          ? `https://vidsrc.wiki/embed/tv/${tmdbOnlyId}/${episodePath}`
          : `https://vidsrc.wiki/embed/movie/${tmdbOnlyId}`,
      },
      {
        id: "vidphantom",
        name: "VidPhantom",
        theme: "rose",
        src: isTv
          ? `https://vidphantom.com/tv/${tmdbOnlyId}/${episodePath}`
          : `https://vidphantom.com/movie/${tmdbOnlyId}`,
      },
      {
        id: "yapgrid",
        name: "YapGrid",
        theme: "emerald",
        src: isTv
          ? `https://yapgrid.com/embed/tv/${tmdbOnlyId}/${episodePath}?lang=pt`
          : `https://yapgrid.com/embed/movie/${tmdbOnlyId}?lang=pt`,
      },
      {
        id: "videasy",
        name: "Videasy",
        theme: "sky",
        src: isTv
          ? `https://player.videasy.net/tv/${tmdbOnlyId}/${episodePath}`
          : `https://player.videasy.net/movie/${tmdbOnlyId}`,
      },
    );

    sources.push(...ADDITIONAL_PLAYER_SOURCES.map((source) => ({
      id: source.id,
      name: source.name,
      theme: source.theme,
      src: isTv
        ? source.tvUrl(tmdbOnlyId, season ?? 1, episode ?? 1)
        : source.movieUrl(tmdbOnlyId),
    })));
  }

  if (fallbackId) {
    const autoEmbedKind = fallbackId.startsWith("tt") ? "imdb" : "tmdb";
    sources.push(
      {
        id: "autoembed-co",
        name: "AutoEmbed",
        theme: "gold",
        src: isTv
          ? `https://autoembed.co/tv/${autoEmbedKind}/${fallbackId}-${episodeDashPath}`
          : `https://autoembed.co/movie/${autoEmbedKind}/${fallbackId}`,
      },
      {
        id: "megaembedapi",
        name: "MegaEmbedAPI",
        theme: "gold",
        src: isTv && /^tt\d+$/i.test(imdbId)
          ? `https://megaembedapi.site/embed/series?imdb=${imdbId}&sea=${season ?? 1}&epi=${episode ?? 1}`
          : `https://megaembedapi.site/embed/${fallbackId}`,
      },
    );
  }

  if (tmdbOnlyId) {
    sources.push(
      {
        id: "ezvidapi",
        name: "EZVidAPI",
        theme: "cyan",
        src: isTv
          ? `https://ezvidapi.com/embed/tv/${tmdbOnlyId}/${episodePath}`
          : `https://ezvidapi.com/embed/movie/${tmdbOnlyId}`,
      },
      {
        id: "xpass",
        name: "XPass Grupo",
        theme: "gold",
        src: isTv
          ? `https://play.xpass.top/e/tv/${tmdbOnlyId}/${episodePath}`
          : `https://play.xpass.top/e/movie/${tmdbOnlyId}`,
      },
      {
        id: "cinesrc",
        name: "CineSrc Grupo",
        theme: "rose",
        src: isTv
          ? `https://cinesrc.st/embed/tv/${tmdbOnlyId}?s=${season ?? 1}&e=${episode ?? 1}&autoplay=false`
          : `https://cinesrc.st/embed/movie/${tmdbOnlyId}?autoplay=false`,
      },
      {
        id: "cinextream",
        name: "CineXtream",
        theme: "emerald",
        src: isTv
          ? `https://cinextream.net/api/embed/tv/${tmdbOnlyId}/${episodePath}`
          : `https://cinextream.net/api/embed/movie/${tmdbOnlyId}`,
      },
      {
        id: "embed-api",
        name: "Embed API",
        theme: "violet",
        src: isTv
          ? `https://player.embed-api.stream/?id=${tmdbOnlyId}&s=${season ?? 1}&e=${episode ?? 1}`
          : `https://player.embed-api.stream/?id=${tmdbOnlyId}&type=movie`,
      },
      {
        id: "iembed",
        name: "iEmbed",
        theme: "cyan",
        src: isTv
          ? `https://iembed.codeera.dev/embed/tv/${tmdbOnlyId}/${episodePath}`
          : `https://iembed.codeera.dev/embed/movie/${tmdbOnlyId}`,
      },
    );
  }

  if (movie.available === true && /^\d+$/.test(tmdbId)) {
    if (!isTv) {
      sources.push({
        id: "cdn-tmdb",
        name: "CDN Brasil",
        theme: "cyan",
        src: `https://cdn-embed.com/${path}/${tmdbId}${episodeSuffix}`,
      });
    }
    if (movie.provider_available === true) {
      sources.push({
        id: "superflix-pro",
        name: "SuperFlix",
        theme: "gold",
        src: withSuperflixFlags(`https://superflixapi.pro/${path}/${tmdbId}${episodeSuffix}`, isTv),
      });
      sources.push({
        id: "superflix-help",
        name: "SuperFlix Alt",
        theme: "violet",
        src: withSuperflixFlags(`https://superflixapi.help/${path}/${tmdbId}${episodeSuffix}`, isTv),
      });
    }
    if (!isTv) {
      sources.push({
        id: "warez-tmdb",
        name: "WarezCDN",
        theme: "emerald",
        src: `https://warezcdn.lat/${path}/${tmdbId}${episodeSuffix}`,
      });
    }
  }

  if (movie.available === true && /^tt\d+$/i.test(imdbId)) {
    if (!isTv) {
      sources.push({
        id: "cdn-imdb",
        name: "CDN IMDb",
        theme: "sky",
        src: `https://cdn-embed.com/${path}/${imdbId}${episodeSuffix}`,
      });
    }
    if (movie.provider_available === true) {
      sources.push({
        id: "superflix-imdb",
        name: "SuperFlix IMDb",
        theme: "rose",
        src: withSuperflixFlags(`https://superflixapi.pro/${path}/${imdbId}${episodeSuffix}`, isTv),
      });
    }
    if (!isTv) {
      sources.push({
        id: "warez-imdb",
        name: "WarezCDN IMDb",
        theme: "emerald",
        src: `https://warezcdn.lat/${path}/${imdbId}${episodeSuffix}`,
      });
    }
  }

  if (!isTv) {
    if (fallbackId) {
      sources.push({
        id: "2embed",
        name: "2Embed",
        theme: "rose",
        src: `https://www.2embed.online/embed/movie/${fallbackId}`,
      });
    }
  }

  if (!isTv && /^tt\d+$/i.test(imdbId)) {
    sources.push({
      id: "filmesyseries",
      name: "Filmes & Séries",
      theme: "gold",
      src: `https://filmesyseries.epizy.com/embed-2/?type=movies&imdb=${imdbId}`,
    });
  }

  const seen = new Set<string>();
  const seenServers = new Set<string>();
  return sources.filter((source) => {
    const serverId = playerServerIdForSource(source.id);
    const server = getPlayerServer(serverId);
    if (
      !server
      || (isTv ? !server.supportsTv : !server.supportsMovie)
      || !source.src
      || seen.has(source.src)
      || seenServers.has(serverId)
      || disabledServerIds.has(serverId)
    ) return false;
    seen.add(source.src);
    seenServers.add(serverId);
    return true;
  }).map((source) => {
    const server = getPlayerServer(playerServerIdForSource(source.id));
    return {
      ...source,
      priority: server?.priority ?? 999,
    };
  }).sort((a, b) => (a.priority ?? 999) - (b.priority ?? 999));
}

function PlayerServerMenu({
  sources,
  activeId,
  onSelect,
  onOpenChange,
  compact = false,
}: {
  sources: PlayerSource[];
  activeId: string;
  onSelect: (id: string) => void;
  onOpenChange?: (open: boolean) => void;
  compact?: boolean;
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
    <div
      className={`player-server-menu theme-${active.theme} ${open ? "is-open" : ""} ${compact ? "is-compact" : ""}`}
      ref={menuRef}
    >
      <button
        type="button"
        className="player-server-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Servidor: ${active.name}`}
        onClick={() => updateOpen(!open)}
      >
        <span className="player-server-dot" aria-hidden="true" />
        <span className="player-server-copy">
          <strong>{active.name}</strong>
        </span>
        <span className="player-server-chevron" aria-hidden="true" />
      </button>

      {open ? (
        <div className="player-server-dropdown" role="listbox" aria-label="Servidores disponíveis">
          <p className="player-server-heading">Servidores disponíveis</p>
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
                <span className="player-server-copy"><strong>{source.name}</strong></span>
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
  onProgress,
  onEpisodeChange,
}: {
  movie: Movie;
  onClose: () => void;
  onProgress: (patch: {
    progresso?: number;
    posicao_segundos?: number;
    temporada?: number | null;
    episodio?: number | null;
  }) => void;
  onEpisodeChange?: (movie: Movie, season: number, episode: number) => void;
}) {
  const isTv = mediaKind(movie) === "tv";
  const localEpisodeControls = true;
  const [season, setSeason] = useState(Math.max(1, movie.season || 1));
  const [episode, setEpisode] = useState(Math.max(1, movie.episode || 1));
  const [seasons, setSeasons] = useState<TvSeasonInfo[]>([]);
  const [episodes, setEpisodes] = useState<TvEpisodeInfo[]>([]);
  const [seasonLoading, setSeasonLoading] = useState(false);
  const [episodePanelOpen, setEpisodePanelOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fsDockVisible, setFsDockVisible] = useState(false);
  const [disabledServerIds, setDisabledServerIds] = useState<Set<string>>(
    () => new Set(DEFAULT_DISABLED_PLAYER_SERVER_IDS),
  );
  const [sourceOrder, setSourceOrder] = useState<string[]>([]);
  const [sourceId, setSourceId] = useState<PlayerSourceId>("");
  const [serverPreparing, setServerPreparing] = useState(true);
  const [failedSourceIds, setFailedSourceIds] = useState<Set<string>>(() => new Set());
  const [serverNotice, setServerNotice] = useState("");
  const [partyProviderId, setPartyProviderId] = useState<string | null>(null);
  const [partyFailure, setPartyFailure] = useState<{ sourceId: string; reason: string; sequence: number } | null>(null);
  const availableSources = useMemo(() => buildPlayerSources(
    movie,
    isTv ? season : undefined,
    isTv ? episode : undefined,
    disabledServerIds,
  ), [movie, isTv, season, episode, disabledServerIds]);
  const sources = useMemo(() => {
    const sourceOrderIndex = new Map(sourceOrder.map((id, index) => [id, index]));
    return [...availableSources].sort((left, right) => {
      const leftIndex = sourceOrderIndex.get(left.id) ?? 999;
      const rightIndex = sourceOrderIndex.get(right.id) ?? 999;
      return leftIndex - rightIndex || (left.priority ?? 999) - (right.priority ?? 999);
    });
  }, [availableSources, sourceOrder]);
  const [menuPinned, setMenuPinned] = useState(false);
  const progressRef = useRef(Math.max(5, Number(movie.progress || 5)));
  const onProgressRef = useRef(onProgress);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const playerIframeRef = useRef<HTMLIFrameElement | null>(null);
  const fsHideTimer = useRef<number | null>(null);
  const iframeLoadedRef = useRef(false);
  const sourceIdRef = useRef(sourceId);
  const activeSource = !sourceId
    ? undefined
    : sources.find((source) => source.id === sourceId);
  const activeSourceSrc = activeSource?.src ?? "";
  const activeSourceName = activeSource?.name ?? "";
  const currentEpisodeInfo = episodes.find((item) => item.episode_number === episode);
  const currentSeasonInfo = seasons.find((item) => item.season_number === season);
  const episodeLabel = isTv
    ? `T${season} E${episode}${currentEpisodeInfo?.name ? ` · ${currentEpisodeInfo.name}` : ""}`
    : null;

  const episodeIndex = episodes.findIndex((item) => item.episode_number === episode);
  const prevEpisode = episodeIndex > 0 ? episodes[episodeIndex - 1] : null;
  const nextEpisode = episodeIndex >= 0 && episodeIndex < episodes.length - 1 ? episodes[episodeIndex + 1] : null;
  const seasonIndex = seasons.findIndex((item) => item.season_number === season);
  const prevSeason = !prevEpisode && seasonIndex > 0 ? seasons[seasonIndex - 1] : null;
  const nextSeason =
    !nextEpisode && seasonIndex >= 0 && seasonIndex < seasons.length - 1 ? seasons[seasonIndex + 1] : null;

  useEffect(() => {
    onProgressRef.current = onProgress;
  }, [onProgress]);

  useEffect(() => {
    sourceIdRef.current = sourceId;
  }, [sourceId]);

  useEffect(() => {
    if (!isTv) return;
    setSeason(Math.max(1, movie.season || 1));
    setEpisode(Math.max(1, movie.episode || 1));
    progressRef.current = Math.max(5, Number(movie.progress || 5));
  }, [isTv, movie.id, movie.season, movie.episode, movie.progress]);

  useEffect(() => {
    const controller = new AbortController();
    const candidates = buildPlayerSources(
      movie,
      isTv ? season : undefined,
      isTv ? episode : undefined,
      new Set(),
    );
    const currentSource = candidates.find((source) => source.id === sourceIdRef.current);
    const preferredServerId = currentSource
      ? playerServerIdForSource(currentSource.id)
      : readPreferredPlayerServer();
    const preferredCandidate = candidates.find(
      (source) => playerServerIdForSource(source.id) === preferredServerId,
    );
    queueMicrotask(() => {
      if (controller.signal.aborted) return;
      setServerPreparing(true);
      setServerNotice(preferredCandidate
        ? `Confirmando ${preferredCandidate.name} para este título…`
        : "Analisando os servidores para este título…");
      setFailedSourceIds(new Set());
      setSourceOrder([]);
      setSourceId(preferredCandidate?.id ?? "");
    });
    fetch("/api/movies/servers", {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: isTv ? "tv" : "movie",
        sources: candidates.map((source) => ({ id: source.id, url: source.src })),
        preferredServerId,
      }),
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Não foi possível avaliar os servidores.");
        return response.json() as Promise<{ disabled?: string[]; order?: string[] }>;
      })
      .then((data) => {
        if (controller.signal.aborted) return;
        const disabled = new Set(Array.isArray(data.disabled) ? data.disabled : []);
        const enabledCandidates = candidates.filter(
          (source) => !disabled.has(playerServerIdForSource(source.id)),
        );
        const requestedOrder = Array.isArray(data.order) ? data.order : [];
        const knownIds = new Set(enabledCandidates.map((source) => source.id));
        const order = [
          ...requestedOrder.filter((id) => knownIds.has(id)),
          ...enabledCandidates.map((source) => source.id).filter((id) => !requestedOrder.includes(id)),
        ];
        setDisabledServerIds(disabled);
        setSourceOrder(order);
        setSourceId(order[0] ?? "");
        setServerNotice(order.length
          ? preferredCandidate && playerServerIdForSource(order[0]) === preferredServerId
            ? `${preferredCandidate.name} continua selecionado.`
            : "Melhor servidor disponível selecionado."
          : "Nenhum servidor disponível para este título.");
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        const fallbackDisabled = new Set(DEFAULT_DISABLED_PLAYER_SERVER_IDS);
        const fallback = candidates.filter(
          (source) => !fallbackDisabled.has(playerServerIdForSource(source.id)),
        );
        const fallbackOrder = [
          ...(preferredCandidate && fallback.some((source) => source.id === preferredCandidate.id) ? [preferredCandidate] : []),
          ...fallback.filter((source) => source.id !== preferredCandidate?.id),
        ];
        setDisabledServerIds(fallbackDisabled);
        setSourceOrder(fallbackOrder.map((source) => source.id));
        setSourceId(fallbackOrder[0]?.id ?? "");
        setServerNotice(preferredCandidate
          ? `A avaliação automática falhou; mantendo ${preferredCandidate.name}.`
          : "A avaliação automática falhou; usando a ordem de segurança.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setServerPreparing(false);
      });
    return () => controller.abort();
  }, [movie.id, movie.tmdb_id, movie.imdb_id, movie.kind, season, episode, isTv]);

  const switchToNextSource = useCallback((failedId: string, reason: string) => {
    if (partyProviderId) {
      setPartyFailure((current) => ({ sourceId: failedId, reason, sequence: (current?.sequence ?? 0) + 1 }));
      setServerNotice(`O player da sessão falhou (${reason}). Tentando trocar o servidor para o grupo…`);
      return;
    }
    const failed = new Set(failedSourceIds);
    if (failedId) failed.add(failedId);
    if (failedId && readPreferredPlayerServer() === playerServerIdForSource(failedId)) {
      writePreferredPlayerServer("");
    }
    const next = sources.find((source) => !failed.has(source.id));
    setFailedSourceIds(failed);
    if (next) {
      const failedName = sources.find((source) => source.id === failedId)?.name ?? "O servidor atual";
      setSourceId(next.id);
      setServerNotice(`${failedName} falhou (${reason}). Trocando automaticamente para ${next.name}.`);
      return;
    }
    setSourceId("");
    setServerNotice("Todos os servidores disponíveis falharam para este título.");
  }, [failedSourceIds, partyProviderId, sources]);

  function selectPlayerSource(id: string) {
    setFailedSourceIds((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
    writePreferredPlayerServer(playerServerIdForSource(id));
    setSourceId(id);
    setServerNotice("");
  }

  useEffect(() => {
    if (!activeSourceSrc) return;
    iframeLoadedRef.current = false;
    const timer = window.setTimeout(() => {
      if (!iframeLoadedRef.current) {
        setServerNotice(`${activeSourceName} ainda está carregando. O servidor não será trocado sem uma falha confirmada.`);
      }
    }, 30_000);
    return () => window.clearTimeout(timer);
  }, [activeSourceName, activeSourceSrc]);

  useEffect(() => {
    if (!activeSource) return;
    let expectedOrigin = "";
    try {
      expectedOrigin = new URL(activeSource.src).origin;
    } catch {
      return;
    }
    const failureSignals = new Set(["fatal-error", "playback-error", "player-error", "media-error", "source-not-found"]);
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== expectedOrigin) return;
      const data = event.data;
      const signal = typeof data === "string"
        ? data
        : data && typeof data === "object"
          ? [data.type, data.event, data.status, data.code].find((value) => typeof value === "string")
          : "";
      const normalized = typeof signal === "string" ? signal.trim().toLowerCase().replaceAll("_", "-") : "";
      if (failureSignals.has(normalized)) switchToNextSource(activeSource.id, "erro informado pelo player");
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [activeSource, switchToNextSource]);

  useEffect(() => {
    if (serverPreparing || !sourceId || !serverNotice) return;
    const timer = window.setTimeout(() => setServerNotice(""), 6_000);
    return () => window.clearTimeout(timer);
  }, [serverNotice, serverPreparing, sourceId]);

  useEffect(() => {
    if (!isTv || !localEpisodeControls) return;
    const controller = new AbortController();
    fetch(`/api/movies?id=${encodeURIComponent(titleId(movie))}&kind=tv`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { seasons?: TvSeasonInfo[] } | null) => {
        const list = Array.isArray(data?.seasons) ? data.seasons.filter((item) => item.season_number > 0) : [];
        setSeasons(list);
        if (list.length > 0 && !list.some((item) => item.season_number === season)) {
          setSeason(list[0].season_number);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setSeasons([]);
      });
    return () => controller.abort();
  }, [isTv, movie.id, movie.tmdb_id]);

  useEffect(() => {
    if (!isTv || !localEpisodeControls) return;
    const controller = new AbortController();
    setSeasonLoading(true);
    fetch(`/api/movies?id=${encodeURIComponent(titleId(movie))}&kind=tv&season=${season}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { episodes?: TvEpisodeInfo[] } | null) => {
        const list = Array.isArray(data?.episodes) ? data.episodes.filter((item) => item.episode_number > 0) : [];
        setEpisodes(list);
      })
      .catch(() => {
        if (!controller.signal.aborted) setEpisodes([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setSeasonLoading(false);
      });
    return () => controller.abort();
  }, [isTv, movie.id, movie.tmdb_id, season]);

  useEffect(() => {
    document.body.classList.add("player-open");
    const cleanup = installPlayerAdblock();
    return () => {
      document.body.classList.remove("player-open");
      cleanup();
    };
  }, []);

  useEffect(() => {
    const syncFullscreen = () => {
      const active = document.fullscreenElement;
      setIsFullscreen(Boolean(active && (active === stageRef.current || stageRef.current?.contains(active))));
    };
    syncFullscreen();
    document.addEventListener("fullscreenchange", syncFullscreen);
    return () => document.removeEventListener("fullscreenchange", syncFullscreen);
  }, []);

  useEffect(() => {
    if (!isFullscreen) {
      setFsDockVisible(false);
      if (fsHideTimer.current) window.clearTimeout(fsHideTimer.current);
      return;
    }

    const reveal = (event: MouseEvent) => {
      if (event.clientY > 72) return;
      setFsDockVisible(true);
      if (fsHideTimer.current) window.clearTimeout(fsHideTimer.current);
      fsHideTimer.current = window.setTimeout(() => setFsDockVisible(false), 2800);
    };

    window.addEventListener("mousemove", reveal, { passive: true });
    return () => {
      window.removeEventListener("mousemove", reveal);
      if (fsHideTimer.current) window.clearTimeout(fsHideTimer.current);
    };
  }, [isFullscreen]);

  async function toggleFullscreen() {
    const stage = stageRef.current;
    if (!stage) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }
      await stage.requestFullscreen();
    } catch {
      // Alguns browsers bloqueiam se o gesto não for direto o suficiente.
    }
  }

  function emitProgress(nextSeason = season, nextEpisode = episode) {
    onProgressRef.current({
      progresso: progressRef.current,
      posicao_segundos: Math.round(progressRef.current * 60),
      temporada: isTv && localEpisodeControls ? nextSeason : null,
      episodio: isTv && localEpisodeControls ? nextEpisode : null,
    });
  }

  function applyEpisode(nextSeason: number, nextEpisode: number, resetProgress = true) {
    setSeason(nextSeason);
    setEpisode(nextEpisode);
    if (resetProgress) progressRef.current = 8;
    onEpisodeChange?.(movie, nextSeason, nextEpisode);
    emitProgress(nextSeason, nextEpisode);
  }

  function selectSeason(next: number) {
    applyEpisode(next, 1);
  }

  function selectEpisode(next: number) {
    applyEpisode(season, next);
    setEpisodePanelOpen(false);
  }

  function goPrevEpisode() {
    if (prevEpisode) {
      selectEpisode(prevEpisode.episode_number);
      return;
    }
    if (prevSeason) {
      applyEpisode(prevSeason.season_number, Math.max(1, prevSeason.episode_count || 1));
    }
  }

  function goNextEpisode() {
    if (nextEpisode) {
      selectEpisode(nextEpisode.episode_number);
      return;
    }
    if (nextSeason) selectSeason(nextSeason.season_number);
  }

  useEffect(() => {
    const timer = window.setInterval(() => {
      progressRef.current = Math.min(95, progressRef.current + 2);
      emitProgress();
    }, 45000);
    emitProgress();
    return () => {
      window.clearInterval(timer);
      emitProgress();
    };
  }, [episode, isTv, season]);

  const canGoPrev = Boolean(prevEpisode || prevSeason);
  const canGoNext = Boolean(nextEpisode || nextSeason);
  const playerMenuSources = partyProviderId
    ? sources.filter((source) => playerServerIdForSource(source.id) === partyProviderId)
    : sources;

  const playerChrome = (
    <>
      <button className="player-icon-btn player-back-btn" type="button" onClick={onClose} aria-label="Voltar">
        <span className="player-back-icon" aria-hidden="true" />
      </button>

      <div className="player-meta">
        <strong className="player-title" title={movie.title}>
          {movie.title}
        </strong>
        {isTv && localEpisodeControls ? <span className="player-ep-badge">{episodeLabel ?? `T${season} E${episode}`}</span> : null}
      </div>

      <div className="player-actions">
        {isTv && localEpisodeControls ? (
          <>
            <button
              type="button"
              className="player-icon-btn"
              aria-label="Episódio anterior"
              disabled={!canGoPrev || seasonLoading || Boolean(partyProviderId)}
              onClick={goPrevEpisode}
            >
              ‹
            </button>
            <button
              type="button"
              className={`player-icon-btn ${episodePanelOpen ? "is-active" : ""}`}
              aria-expanded={episodePanelOpen}
              aria-label="Episódios"
              disabled={Boolean(partyProviderId)}
              onClick={() => setEpisodePanelOpen((value) => !value)}
            >
              Eps
            </button>
            <button
              type="button"
              className="player-icon-btn"
              aria-label="Próximo episódio"
              disabled={!canGoNext || seasonLoading || Boolean(partyProviderId)}
              onClick={goNextEpisode}
            >
              ›
            </button>
          </>
        ) : null}
        <PlayerServerMenu
          compact
          sources={serverPreparing ? [] : playerMenuSources}
          activeId={activeSource?.id ?? ""}
          onSelect={selectPlayerSource}
          onOpenChange={setMenuPinned}
        />
        <button
          type="button"
          className={`player-icon-btn player-fs-btn ${isFullscreen ? "is-active" : ""}`}
          aria-label={isFullscreen ? "Sair da tela cheia" : "Tela cheia"}
          onClick={() => void toggleFullscreen()}
        >
          <span className="player-fs-enter" aria-hidden="true">⛶</span>
          <span className="player-fs-exit" aria-hidden="true">⤡</span>
        </button>
      </div>
    </>
  );

  return (
    <div
      className={`player-view ${isFullscreen ? "is-fullscreen" : ""} ${menuPinned || episodePanelOpen ? "is-menu-open" : ""} ${activeSource ? `theme-${activeSource.theme}` : ""}`}
      data-flixa="player"
    >
      {!isFullscreen ? (
        <header className="player-chrome" data-flixa="player-chrome">
          <div className="player-bar">{playerChrome}</div>

          {isTv && localEpisodeControls && episodePanelOpen ? (
            <div className="player-episode-drawer" role="dialog" aria-label="Lista de episódios" data-flixa="player-episodes">
              <div className="player-episode-drawer-head">
                <strong>Episódios</strong>
                <button type="button" className="text-link" onClick={() => setEpisodePanelOpen(false)}>
                  Fechar
                </button>
              </div>
              {seasons.length ? (
                <div className="tv-season-tabs tv-season-tabs--compact" role="tablist" aria-label="Temporadas">
                  {seasons.map((item) => (
                    <button
                      key={item.season_number}
                      type="button"
                      role="tab"
                      aria-selected={item.season_number === season}
                      className={item.season_number === season ? "is-active" : ""}
                      onClick={() => selectSeason(item.season_number)}
                    >
                      T{item.season_number}
                    </button>
                  ))}
                </div>
              ) : null}
              {seasonLoading ? <p className="tv-catalog-status">Carregando…</p> : null}
              {!seasonLoading && episodes.length ? (
                <div className="player-episode-list">
                  {episodes.map((item) => {
                    const still = imageSrc(item.still, "w780");
                    const active = item.episode_number === episode;
                    return (
                      <button
                        key={item.episode_number}
                        type="button"
                        className={`player-episode-item ${active ? "is-active" : ""}`}
                        onClick={() => selectEpisode(item.episode_number)}
                      >
                        <span className="tv-episode-thumb">
                          <ResilientImage
                            key={`${season}-${item.episode_number}`}
                            sources={[
                              still,
                              imageSrc(movie.backdrop, "w780"),
                              imageSrc(currentSeasonInfo?.poster, "w780"),
                              imageSrc(movie.poster, "w780"),
                            ]}
                            alt=""
                            loading="lazy"
                            fallback={<span>E{item.episode_number}</span>}
                          />
                        </span>
                        <span className="tv-episode-copy">
                          <strong>
                            {item.episode_number}. {item.name}
                          </strong>
                          {item.runtime ? <small>{item.runtime} min</small> : null}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          ) : null}
        </header>
      ) : null}

      <div className="player-stage-wrap" ref={stageRef}>
        <div className="watch-party-layer">
          <WatchPartyControls
            media={{
              id: titleId(movie),
              title: movie.title,
              kind: isTv ? "tv" : "movie",
              season: isTv ? season : undefined,
              episode: isTv ? episode : undefined,
            }}
            sources={serverPreparing ? [] : sources}
            activeSource={activeSource}
            playerRef={playerIframeRef}
            onSelectSource={selectPlayerSource}
            onOpenChange={setMenuPinned}
            onSessionProviderChange={setPartyProviderId}
            providerFailure={partyFailure}
          />
        </div>
        {isFullscreen ? (
          <div className={`player-fs-dock ${fsDockVisible || menuPinned || episodePanelOpen ? "is-visible" : ""}`}>
            <div className="player-bar player-bar--dock">{playerChrome}</div>
            {isTv && localEpisodeControls && episodePanelOpen ? (
              <div className="player-episode-drawer player-episode-drawer--dock" role="dialog" aria-label="Lista de episódios">
                <div className="player-episode-drawer-head">
                  <strong>Episódios</strong>
                  <button type="button" className="text-link" onClick={() => setEpisodePanelOpen(false)}>
                    Fechar
                  </button>
                </div>
                {seasons.length ? (
                  <div className="tv-season-tabs tv-season-tabs--compact" role="tablist" aria-label="Temporadas">
                    {seasons.map((item) => (
                      <button
                        key={item.season_number}
                        type="button"
                        role="tab"
                        aria-selected={item.season_number === season}
                        className={item.season_number === season ? "is-active" : ""}
                        onClick={() => selectSeason(item.season_number)}
                      >
                        T{item.season_number}
                      </button>
                    ))}
                  </div>
                ) : null}
                {!seasonLoading && episodes.length ? (
                  <div className="player-episode-list">
                    {episodes.map((item) => (
                      <button
                        key={item.episode_number}
                        type="button"
                        className={`player-episode-item ${item.episode_number === episode ? "is-active" : ""}`}
                        onClick={() => selectEpisode(item.episode_number)}
                      >
                        <span className="tv-episode-copy">
                          <strong>
                            {item.episode_number}. {item.name}
                          </strong>
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {serverNotice ? (
          <div className={`player-auto-notice ${serverPreparing ? "is-loading" : ""}`} role="status">
            <span aria-hidden="true" />
            {serverNotice}
          </div>
        ) : null}

        {activeSource ? (
          <iframe
            key={`${activeSource.src}:${partyProviderId ? "party" : "protected"}`}
            ref={playerIframeRef}
            className="video-stage"
            src={activeSource.src}
            onLoad={() => {
              iframeLoadedRef.current = true;
            }}
            onError={() => switchToNextSource(activeSource.id, "erro ao abrir o iframe")}
            allowFullScreen
            allow="autoplay; fullscreen *; encrypted-media; picture-in-picture"
            referrerPolicy="strict-origin-when-cross-origin"
            sandbox={partyProviderId ? undefined : "allow-scripts allow-same-origin allow-forms allow-presentation allow-orientation-lock allow-popups allow-popups-to-escape-sandbox"}
            title={movie.title}
          />
        ) : serverPreparing ? (
          <div className="video-stage video-empty player-server-search">
            <span className="player-search-spinner" aria-hidden="true" />
            <strong>Buscando o melhor servidor</strong>
            <p>Testando este título antes de abrir o player…</p>
          </div>
        ) : (
          <div className="video-stage video-empty">
            <p>{sources.length ? "Nenhum servidor conseguiu carregar este título." : "Este título ainda não tem um ID válido para reprodução."}</p>
          </div>
        )}
      </div>
    </div>
  );
}
