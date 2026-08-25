import { listarServidoresDesabilitados } from "../../../db/player-servers";
import { DEFAULT_DISABLED_PLAYER_SERVER_IDS, PLAYER_SERVERS } from "../../../lib/player-servers";

export const dynamic = "force-dynamic";

type MediaKind = "movie" | "tv";

type CatalogMovie = {
  id: string;
  source: string;
  kind: MediaKind;
  list?: string;
  imdb_id?: string;
  tmdb_id?: string;
  title: string;
  description?: string;
  poster: string;
  backdrop: string;
  duration?: string;
  durationSeconds?: number;
  year?: number;
  genres: string[];
  genreIds: number[];
  rating?: string;
  director?: string;
  cast?: string[];
  trailer?: string;
  available: boolean;
  server_count?: number;
  playback_locale: "pt-BR";
  is_brazilian?: boolean;
};

type Genre = { id: number; name: string };

const CANONICAL_GENRE_NAMES: Record<MediaKind, Record<number, string>> = {
  movie: {
    12: "Aventura",
    14: "Fantasia",
    16: "Animação",
    18: "Drama",
    27: "Terror",
    28: "Ação",
    35: "Comédia",
    36: "História",
    37: "Faroeste",
    53: "Suspense",
    80: "Crime",
    99: "Documentário",
    878: "Ficção científica",
    9648: "Mistério",
    10402: "Música",
    10749: "Romance",
    10751: "Família",
    10752: "Guerra",
    10770: "Cinema TV",
  },
  tv: {
    16: "Animação",
    18: "Drama",
    35: "Comédia",
    37: "Faroeste",
    80: "Crime",
    99: "Documentário",
    9648: "Mistério",
    10751: "Família",
    10759: "Ação e Aventura",
    10762: "Infantil",
    10763: "Notícias",
    10764: "Reality show",
    10765: "Ficção científica e Fantasia",
    10766: "Novela",
    10767: "Talk show",
    10768: "Guerra e Política",
  },
};

const TMDB_API = "https://api.themoviedb.org/3";
const TMDB_IMAGE = "https://image.tmdb.org/t/p";
const TMDB_LANGUAGE = "pt-BR";

const TMDB_LISTS = [
  { id: "trending", name: "Em alta", path: "/trending/movie/week", kind: "movie" as const },
  { id: "popular", name: "Populares", path: "/movie/popular", kind: "movie" as const },
  { id: "now_playing", name: "Em cartaz", path: "/movie/now_playing", kind: "movie" as const },
  { id: "top_rated", name: "Melhores", path: "/movie/top_rated", kind: "movie" as const },
  { id: "tv_trending", name: "Séries em alta", path: "/trending/tv/week", kind: "tv" as const },
  { id: "tv_popular", name: "Séries populares", path: "/tv/popular", kind: "tv" as const },
  { id: "tv_on_the_air", name: "No ar", path: "/tv/on_the_air", kind: "tv" as const },
  { id: "tv_top_rated", name: "Melhores séries", path: "/tv/top_rated", kind: "tv" as const },
] as const;

function getTmdbCredentials() {
  return {
    token:
      process.env.TMDB_ACCESS_TOKEN ||
      process.env.TMDB_READ_ACCESS_TOKEN ||
      "",
    apiKey: process.env.TMDB_API_KEY || "",
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || /^n\/a$/i.test(trimmed)) return null;
  return trimmed;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(",", "."));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function looksLikeMovie(value: unknown): value is Record<string, unknown> {
  const item = asRecord(value);
  if (!item) return false;
  return Boolean(
    item.title ||
      item.name ||
      item.original_title ||
      item.original_name ||
      item.movie_title ||
      item.Title,
  );
}

function findMovieItems(data: unknown, depth = 0): Record<string, unknown>[] {
  if (depth > 6 || data == null) return [];

  if (Array.isArray(data)) {
    const movies = data.filter(looksLikeMovie);
    if (movies.length > 0) return movies;
    for (const item of data) {
      const found = findMovieItems(item, depth + 1);
      if (found.length > 0) return found;
    }
    return [];
  }

  const obj = asRecord(data);
  if (!obj) return [];

  for (const key of ["movies", "results", "items", "data", "result"]) {
    if (key in obj) {
      const found = findMovieItems(obj[key], depth + 1);
      if (found.length > 0) return found;
    }
  }

  return [];
}

function extractApiMessage(data: unknown): string | null {
  const obj = asRecord(data);
  if (!obj) return null;
  return asString(obj.message) || asString(obj.error) || asString(obj.status_message) || null;
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    const text = asString(value);
    if (text) return text;
  }
  return null;
}

function asGenres(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === "string") return item.trim();
        const obj = asRecord(item);
        return obj ? firstString(obj.name, obj.title, obj.genre) : null;
      })
      .filter((item): item is string => Boolean(item));
  }

  const text = asString(value);
  if (text) return text.split(/[,|/]/).map((item) => item.trim()).filter(Boolean);
  return [];
}

function asRating(movie: Record<string, unknown>): string | undefined {
  const numeric = asNumber(movie.vote_average) ?? asNumber(movie.rating);
  if (numeric != null) return numeric >= 0 && numeric <= 10 ? String(numeric) : undefined;
  const text = firstString(movie.rating);
  return text && text.length <= 12 ? text : undefined;
}

function asYear(movie: Record<string, unknown>, kind: MediaKind): number | undefined {
  const year = asNumber(movie.year);
  if (year && year > 1800 && year < 3000) return Math.round(year);

  const released = firstString(
    kind === "tv" ? movie.first_air_date : movie.release_date,
    movie.first_air_date,
    movie.release_date,
    movie.released,
  );
  if (released) {
    const parsed = new Date(released).getFullYear();
    if (Number.isFinite(parsed) && parsed > 1800) return parsed;
  }

  return undefined;
}

function asDuration(runtime: unknown): { duration?: string; durationSeconds?: number } {
  const numeric = asNumber(runtime);
  if (numeric && numeric > 0) {
    const minutes = numeric > 1000 ? Math.round(numeric / 60) : Math.round(numeric);
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return {
      duration: hours > 0 ? `${hours}h ${String(rest).padStart(2, "0")}min` : `${rest}min`,
      durationSeconds: minutes * 60,
    };
  }
  return {};
}

function describeFetchError(error: unknown) {
  const message = error instanceof Error ? error.message : "Conexão";
  if (/dns|name or service not known|internal error/i.test(message)) {
    return "DNS/conexão bloqueada";
  }
  return message;
}

function tmdbImageUrl(path: unknown, size: "w342" | "w780" | "w1280") {
  const text = asString(path);
  if (!text) return null;
  if (text.startsWith("http://") || text.startsWith("https://")) return text;
  if (text.startsWith("//")) return `https:${text}`;
  return `${TMDB_IMAGE}/${size}${text.startsWith("/") ? text : `/${text}`}`;
}

function tmdbImagePath(value: unknown) {
  if (!Array.isArray(value)) return null;
  for (const item of value) {
    const path = firstString(asRecord(item)?.file_path);
    if (path) return path;
  }
  return null;
}

function tmdbGenreIds(movie: Record<string, unknown>) {
  const rawIds = Array.isArray(movie.genre_ids)
    ? movie.genre_ids
    : Array.isArray(movie.genres)
      ? movie.genres.map((genre) => asRecord(genre)?.id)
      : [];

  return [...new Set(
    rawIds
      .map((id) => asNumber(id))
      .filter((id): id is number => id != null && Number.isInteger(id) && id > 0),
  )];
}

function canonicalGenreName(kind: MediaKind, id: number, fallback?: string) {
  return CANONICAL_GENRE_NAMES[kind][id] || fallback || null;
}

function tmdbGenreNames(
  movie: Record<string, unknown>,
  genreMap: Map<number, string>,
  kind: MediaKind,
  genreIds: number[],
) {
  const named = asGenres(movie.genres);
  if (genreIds.length > 0) {
    return genreIds
      .map((id, index) => canonicalGenreName(kind, id, genreMap.get(id) || named[index]))
      .filter((name): name is string => Boolean(name));
  }
  return named;
}

function isBrazilianProduction(movie: Record<string, unknown>) {
  const originCountries = Array.isArray(movie.origin_country) ? movie.origin_country : [];
  const productionCountries = Array.isArray(movie.production_countries)
    ? movie.production_countries
        .map((item) => asRecord(item))
        .map((item) => firstString(item?.iso_3166_1))
    : [];
  return [...originCountries, ...productionCountries].some((country) => String(country).toUpperCase() === "BR");
}

function tmdbCredits(movie: Record<string, unknown>, kind: MediaKind) {
  const credits = asRecord(movie.credits);
  const crew = Array.isArray(credits?.crew) ? credits.crew : [];
  const cast = Array.isArray(credits?.cast) ? credits.cast : [];
  const created = Array.isArray(movie.created_by) ? movie.created_by : [];

  const director = crew
    .map((item) => asRecord(item))
    .find((item) => item && asString(item.job) === "Director");

  const creator = created
    .map((item) => asRecord(item))
    .map((item) => firstString(item?.name))
    .find(Boolean);

  const names = cast
    .map((item) => firstString(asRecord(item)?.name))
    .filter((name): name is string => Boolean(name))
    .slice(0, 5);

  return {
    director: firstString(director?.name) ?? (kind === "tv" ? creator : null) ?? undefined,
    cast: names.length > 0 ? names : undefined,
  };
}

function tmdbTrailer(movie: Record<string, unknown>) {
  const videos = asRecord(movie.videos);
  const results = Array.isArray(videos?.results) ? videos.results : [];
  const trailer = results
    .map((item) => asRecord(item))
    .find((item) => {
      if (!item || asString(item.site) !== "YouTube") return false;
      const type = asString(item.type);
      return type === "Trailer" || type === "Teaser";
    });

  const key = firstString(trailer?.key);
  return key ? `https://www.youtube.com/embed/${key}` : undefined;
}

function detectKind(movie: Record<string, unknown>, fallback: MediaKind): MediaKind {
  const raw = firstString(movie.media_type);
  if (raw === "tv" || raw === "movie") return raw;
  if (movie.first_air_date && !movie.release_date) return "tv";
  if (movie.name && !movie.title) return "tv";
  return fallback;
}

function mapTmdbMovie(
  movie: Record<string, unknown>,
  sourceName: string,
  genreMap: Map<number, string>,
  fallbackKind: MediaKind,
  listId?: string,
): CatalogMovie | null {
  if (movie.adult === true) return null;

  const kind = detectKind(movie, fallbackKind);
  const title = firstString(
    kind === "tv" ? movie.name : movie.title,
    movie.title,
    movie.name,
    movie.original_title,
    movie.original_name,
  );
  const tmdbId = firstString(movie.id != null ? String(movie.id) : null);
  if (!title || !tmdbId) return null;

  const images = asRecord(movie.images);
  const posterPath = firstString(movie.poster_path) || tmdbImagePath(images?.posters) || firstString(movie.backdrop_path);
  const backdropPath = firstString(movie.backdrop_path) || tmdbImagePath(images?.backdrops) || posterPath;
  const poster = tmdbImageUrl(posterPath, "w342");
  const backdrop = tmdbImageUrl(backdropPath, "w780") || poster;
  const seasons = asNumber(movie.number_of_seasons);
  const episodeRuntime = Array.isArray(movie.episode_run_time)
    ? asNumber(movie.episode_run_time[0])
    : null;
  const { duration, durationSeconds } =
    kind === "tv" && seasons
      ? { duration: `${seasons} ${seasons === 1 ? "temp." : "temps."}`, durationSeconds: undefined }
      : asDuration(movie.runtime ?? episodeRuntime);
  const { director, cast } = tmdbCredits(movie, kind);
  const genreIds = tmdbGenreIds(movie);

  return {
    id: `${kind}-${tmdbId}`,
    source: sourceName,
    kind,
    list: listId,
    tmdb_id: tmdbId,
    imdb_id: firstString(movie.imdb_id, asRecord(movie.external_ids)?.imdb_id) ?? undefined,
    title,
    description: firstString(movie.overview, movie.tagline) ?? undefined,
    poster: poster ?? "",
    backdrop: backdrop ?? poster ?? "",
    duration,
    durationSeconds,
    year: asYear(movie, kind),
    genres: tmdbGenreNames(movie, genreMap, kind, genreIds),
    genreIds,
    rating: asRating(movie),
    director,
    cast,
    trailer: tmdbTrailer(movie),
    available: true,
    playback_locale: "pt-BR",
    is_brazilian: isBrazilianProduction(movie) || undefined,
  };
}

function retainPlayableTitles(movies: CatalogMovie[]) {
  const seen = new Set<string>();
  return movies.filter((movie) => {
    const id = movie.tmdb_id || movie.id.replace(/^(?:movie-|tv-)/i, "");
    const key = `${movie.kind}:${id}`;
    const title = movie.title.trim();
    const safePoster = /^https:\/\//i.test(movie.poster);
    const safeBackdrop = !movie.backdrop || /^https:\/\//i.test(movie.backdrop);
    if (!/^[1-9]\d*$/.test(id) || !title || title.length > 200 || !safePoster || !safeBackdrop || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function markProviderAvailability(movies: CatalogMovie[]) {
  const playable = retainPlayableTitles(movies);
  let disabledIds: string[] = [];
  try {
    disabledIds = await listarServidoresDesabilitados();
  } catch {
    disabledIds = [...DEFAULT_DISABLED_PLAYER_SERVER_IDS];
  }
  const disabled = new Set(disabledIds);
  const enabledServerCount = {
    movie: PLAYER_SERVERS.filter((server) => server.supportsMovie && !disabled.has(server.id)).length,
    tv: PLAYER_SERVERS.filter((server) => server.supportsTv && !disabled.has(server.id)).length,
  };
  return playable.map((movie) => {
    const serverCount = enabledServerCount[movie.kind];
    return {
      ...movie,
      available: serverCount > 0,
      server_count: serverCount,
    };
  });
}

async function tmdbRequest(path: string, params: Record<string, string> = {}) {
  const { token, apiKey } = getTmdbCredentials();
  if (!token && !apiKey) {
    throw new Error("chave TMDB ausente");
  }

  const url = new URL(`${TMDB_API}${path}`);
  url.searchParams.set("language", TMDB_LANGUAGE);
  url.searchParams.set("include_image_language", "pt-BR,pt,null");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  if (!token && apiKey) {
    url.searchParams.set("api_key", apiKey);
  }

  const headers: HeadersInit = {
    Accept: "application/json",
    "User-Agent": "Flixa/1.0",
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    method: "GET",
    headers,
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });

  const payload = await res.text();
  let data: unknown = null;
  try {
    data = payload ? JSON.parse(payload) : null;
  } catch {
    throw new Error(`resposta inválida (${res.status})`);
  }

  if (!res.ok) {
    const message = extractApiMessage(data);
    throw new Error(`${res.status}${message ? ` (${message})` : ""}`);
  }

  return data;
}

async function fetchTmdbGenreMap(kind: MediaKind) {
  const data = asRecord(await tmdbRequest(`/genre/${kind}/list`));
  const genres = Array.isArray(data?.genres) ? data.genres : [];
  const map = new Map<number, string>();
  const list: Genre[] = [];

  for (const item of genres) {
    const genre = asRecord(item);
    const id = asNumber(genre?.id);
    const providerName = firstString(genre?.name);
    const name = id != null ? canonicalGenreName(kind, id, providerName || undefined) : null;
    if (id != null && name) {
      map.set(id, name);
      list.push({ id, name });
    }
  }

  return { map, list };
}

function findList(listId: string) {
  return TMDB_LISTS.find((list) => list.id === listId) ?? null;
}

async function fetchTmdbList(
  list: (typeof TMDB_LISTS)[number],
  genreMap: Map<number, string>,
  page = 1,
) {
  const data = await tmdbRequest(list.path, { page: String(page) });
  const movies = findMovieItems(data)
    .map((movie) => mapTmdbMovie(movie, list.name, genreMap, list.kind, list.id))
    .filter((movie): movie is CatalogMovie => Boolean(movie));
  return markProviderAvailability(movies);
}

async function fetchTmdbCatalog() {
  const { token, apiKey } = getTmdbCredentials();
  if (!token && !apiKey) {
    return {
      movies: [] as CatalogMovie[],
      genres: [] as Genre[],
      error: "TMDB: chave ausente (TMDB_ACCESS_TOKEN ou TMDB_API_KEY)",
    };
  }

  try {
    const [movieGenres, tvGenres] = await Promise.all([
      fetchTmdbGenreMap("movie"),
      fetchTmdbGenreMap("tv"),
    ]);
    const lists = await Promise.allSettled(
      TMDB_LISTS.map((list) => fetchTmdbList(list, list.kind === "tv" ? tvGenres.map : movieGenres.map)),
    );

    const movies: CatalogMovie[] = [];
    const errors: string[] = [];

    lists.forEach((result, index) => {
      const name = TMDB_LISTS[index].name;
      if (result.status === "fulfilled") {
        if (result.value.length === 0) {
          errors.push(`${name}: Sem resultados`);
          return;
        }
        movies.push(...result.value);
        return;
      }
      errors.push(`${name}: ${describeFetchError(result.reason)}`);
    });

    return {
      movies,
      genres: movieGenres.list,
      error: errors.length > 0 ? errors.join(" · ") : null,
    };
  } catch (error) {
    return {
      movies: [] as CatalogMovie[],
      genres: [] as Genre[],
      error: `TMDB: ${describeFetchError(error)}`,
    };
  }
}

async function searchTmdb(query: string) {
  const { token, apiKey } = getTmdbCredentials();
  if (!token && !apiKey) {
    return { movies: [] as CatalogMovie[], errors: ["TMDB: chave ausente (TMDB_ACCESS_TOKEN ou TMDB_API_KEY)"] };
  }

  try {
    const [movieGenres, tvGenres, movieData, tvData] = await Promise.all([
      fetchTmdbGenreMap("movie"),
      fetchTmdbGenreMap("tv"),
      tmdbRequest("/search/movie", { query, include_adult: "false", page: "1" }),
      tmdbRequest("/search/tv", { query, include_adult: "false", page: "1" }),
    ]);

    const movies = await markProviderAvailability([
      ...findMovieItems(movieData).map((movie) =>
        mapTmdbMovie(movie, "Busca", movieGenres.map, "movie"),
      ),
      ...findMovieItems(tvData).map((movie) =>
        mapTmdbMovie(movie, "Busca", tvGenres.map, "tv"),
      ),
    ].filter((movie): movie is CatalogMovie => Boolean(movie)));

    return {
      movies,
      errors: movies.length === 0 ? ["TMDB: Sem resultados"] : [],
    };
  } catch (error) {
    return { movies: [] as CatalogMovie[], errors: [`TMDB: ${describeFetchError(error)}`] };
  }
}

function parseTmdbId(movieId: string) {
  return movieId.replace(/^(tmdb-)?(movie-|tv-)?/i, "");
}

async function getTmdbDetails(movieId: string, kind: MediaKind) {
  const { token, apiKey } = getTmdbCredentials();
  if (!token && !apiKey) {
    return { movie: null, similar: [] as CatalogMovie[], error: "TMDB: chave ausente (TMDB_ACCESS_TOKEN ou TMDB_API_KEY)" };
  }

  const id = parseTmdbId(movieId);
  if (!/^\d+$/.test(id)) {
    return { movie: null, similar: [] as CatalogMovie[], error: "TMDB: id inválido" };
  }

  try {
    const path = kind === "tv" ? `/tv/${id}` : `/movie/${id}`;
    const data = asRecord(
      await tmdbRequest(path, { append_to_response: "credits,videos,external_ids,similar,images" }),
    );
    if (!data) {
      return { movie: null, similar: [] as CatalogMovie[], error: "TMDB: Sem resultados" };
    }

    const genreMap = new Map<number, string>();
    const mappedMovie = mapTmdbMovie(data, kind === "tv" ? "Série" : "Filme", genreMap, kind);
    const [movie] = mappedMovie ? await markProviderAvailability([mappedMovie]) : [];
    const similar = await markProviderAvailability(findMovieItems(asRecord(data.similar))
      .map((item) => mapTmdbMovie(item, "Semelhantes", genreMap, kind))
      .filter((item): item is CatalogMovie => Boolean(item))
      .slice(0, 12));

    const seasons = Array.isArray(data.seasons)
      ? data.seasons
          .map((item) => asRecord(item))
          .filter((item): item is Record<string, unknown> => Boolean(item))
          .map((item) => ({
            season_number: asNumber(item.season_number) ?? 0,
            episode_count: asNumber(item.episode_count) ?? 0,
            name: asString(item.name) || `Temporada ${asNumber(item.season_number) ?? "?"}`,
            air_date: asString(item.air_date) || undefined,
            poster: tmdbImageUrl(item.poster_path, "w342") || undefined,
          }))
          .filter((item) => item.season_number > 0)
      : [];

    return movie
      ? { movie, similar, seasons, error: null as string | null }
      : { movie: null, similar: [] as CatalogMovie[], seasons: [], error: "TMDB: Sem resultados" };
  } catch (error) {
    return {
      movie: null,
      similar: [] as CatalogMovie[],
      seasons: [],
      error: `TMDB: ${describeFetchError(error)}`,
    };
  }
}

async function getTmdbSeason(movieId: string, seasonNumber: number) {
  const { token, apiKey } = getTmdbCredentials();
  if (!token && !apiKey) {
    return { season: null, episodes: [], error: "TMDB: chave ausente (TMDB_ACCESS_TOKEN ou TMDB_API_KEY)" };
  }

  const id = parseTmdbId(movieId);
  if (!/^\d+$/.test(id) || !Number.isFinite(seasonNumber) || seasonNumber < 1) {
    return { season: null, episodes: [], error: "TMDB: temporada inválida" };
  }

  try {
    const data = asRecord(await tmdbRequest(`/tv/${id}/season/${seasonNumber}`));
    if (!data) {
      return { season: null, episodes: [], error: "TMDB: Sem resultados" };
    }

    const today = new Date().toISOString().slice(0, 10);
    const episodes = Array.isArray(data.episodes)
      ? data.episodes
          .map((item) => asRecord(item))
          .filter((item): item is Record<string, unknown> => Boolean(item))
          .map((item) => ({
            episode_number: asNumber(item.episode_number) ?? 0,
            name: asString(item.name) || `Episódio ${asNumber(item.episode_number) ?? "?"}`,
            overview: asString(item.overview) || "",
            still: tmdbImageUrl(item.still_path, "w780") || "",
            runtime: asNumber(item.runtime) || undefined,
            air_date: asString(item.air_date) || undefined,
          }))
          .filter((item) => item.episode_number > 0 && (!item.air_date || item.air_date <= today))
      : [];

    return {
      season: {
        season_number: asNumber(data.season_number) ?? seasonNumber,
        name: asString(data.name) || `Temporada ${seasonNumber}`,
        overview: asString(data.overview) || "",
        poster: tmdbImageUrl(data.poster_path, "w342") || "",
        episode_count: episodes.length,
      },
      episodes,
      error: null as string | null,
    };
  } catch (error) {
    return { season: null, episodes: [], error: `TMDB: ${describeFetchError(error)}` };
  }
}

async function fetchListPage(listId: string, page: number) {
  const list = findList(listId);
  if (!list) {
    return { movies: [] as CatalogMovie[], page, totalPages: 0, error: "Lista inválida" };
  }

  try {
    const { map } = await fetchTmdbGenreMap(list.kind);
    const movies = await fetchTmdbList(list, map, page);
    return { movies, page, totalPages: page + (movies.length > 0 ? 1 : 0), error: null as string | null };
  } catch (error) {
    return { movies: [] as CatalogMovie[], page, totalPages: page, error: describeFetchError(error) };
  }
}

const BROWSE_PAGE_SIZE = 50;
const TMDB_PAGE_SIZE = 20;
const TMDB_DISCOVER_CAP = 10000;

async function browseCatalog(kind: MediaKind, page: number, genreId?: string) {
  const hasGenre = Boolean(genreId && /^\d+$/.test(genreId));
  const selectedGenreId = hasGenre ? Number(genreId) : null;
  const start = (page - 1) * BROWSE_PAGE_SIZE;
  const firstTmdbPage = Math.floor(start / TMDB_PAGE_SIZE) + 1;
  const lastTmdbPage = Math.ceil((start + BROWSE_PAGE_SIZE) / TMDB_PAGE_SIZE);
  const path = kind === "tv" ? "/discover/tv" : "/discover/movie";
  const params: Record<string, string> = {
    include_adult: "false",
    sort_by: "popularity.desc",
    "vote_count.gte": "100",
    "vote_average.gte": "5",
  };
  if (hasGenre && genreId) params.with_genres = genreId;

  try {
    const { map } = await fetchTmdbGenreMap(kind);
    const results = await Promise.all(
      Array.from({ length: lastTmdbPage - firstTmdbPage + 1 }, (_, index) =>
        tmdbRequest(path, {
          ...params,
          page: String(firstTmdbPage + index),
        }),
      ),
    );

    const totalResults = Math.min(asNumber(asRecord(results[0])?.total_results) ?? 0, TMDB_DISCOVER_CAP);
    const label = hasGenre
      ? map.get(Number(genreId)) || (kind === "tv" ? "Séries" : "Filmes")
      : kind === "tv"
        ? "Séries"
        : "Filmes";
    const listId = hasGenre ? `genre-${kind}-${genreId}` : undefined;
    const movies = results.flatMap((data) =>
      findMovieItems(data)
        .map((item) => mapTmdbMovie(item, label, map, kind, listId))
        .filter((item): item is CatalogMovie => Boolean(
          item?.poster &&
          item.kind === kind &&
          (selectedGenreId == null || item.genreIds.includes(selectedGenreId))
        ))
        .map((item) => {
          if (selectedGenreId == null) return item;
          const selectedName = map.get(selectedGenreId);
          if (!selectedName) return item;
          return {
            ...item,
            genres: [selectedName, ...item.genres.filter((name) => name !== selectedName)],
          };
        }),
    );
    const offset = start - (firstTmdbPage - 1) * TMDB_PAGE_SIZE;
    const candidates = movies.slice(offset, offset + BROWSE_PAGE_SIZE);
    const slice = await markProviderAvailability(candidates);
    const totalPages = Math.max(1, Math.ceil(totalResults / BROWSE_PAGE_SIZE));

    return {
      movies: slice,
      page,
      totalPages,
      totalResults: slice.length,
      genreId: hasGenre ? String(genreId) : null,
      error: slice.length === 0 ? "Sem resultados" : null,
    };
  } catch (error) {
    return {
      movies: [] as CatalogMovie[],
      page,
      totalPages: page,
      totalResults: 0,
      genreId: genreId || null,
      error: describeFetchError(error),
    };
  }
}

async function discoverByGenre(genreId: string, kind: MediaKind, page: number) {
  return browseCatalog(kind, page, genreId);
}

/** Pool dos títulos mais populares para o Surpreenda-me (várias páginas TMDB). */
async function roulettePool(genreId: string, kind: MediaKind, pages = 5, maxMinutes?: number) {
  const pageCount = Math.min(8, Math.max(1, Math.floor(pages) || 5));
  const allGenres = !genreId || genreId === "all" || genreId === "0";
  if (!allGenres && !/^\d+$/.test(genreId)) {
    return { movies: [] as CatalogMovie[], genre: null as Genre | null, error: "Gênero inválido" };
  }

  try {
    const { map, list } = await fetchTmdbGenreMap(kind);
    const genreName = allGenres ? "Todos" : map.get(Number(genreId)) || "Gênero";
    const genre = allGenres
      ? { id: 0, name: "Todos" }
      : (list.find((item) => item.id === Number(genreId)) ?? { id: Number(genreId), name: genreName });

    const params: Record<string, string> = {
      page: "1",
      sort_by: "popularity.desc",
      include_adult: "false",
      "vote_count.gte": kind === "movie" ? "300" : "120",
      "vote_average.gte": "6",
    };
    if (!allGenres) params.with_genres = genreId;
    if (maxMinutes && maxMinutes >= 30 && maxMinutes <= 300) params["with_runtime.lte"] = String(maxMinutes);

    const results = await Promise.all(
      Array.from({ length: pageCount }, (_, index) =>
        tmdbRequest(`/discover/${kind}`, {
          ...params,
          page: String(index + 1),
        }),
      ),
    );

    const seen = new Set<string>();
    const movies: CatalogMovie[] = [];
    for (const data of results) {
      for (const item of findMovieItems(data)) {
        const movie = mapTmdbMovie(item, genreName, map, kind, allGenres ? `roleta-${kind}-all` : `roleta-${kind}-${genreId}`);
        if (!movie?.poster) continue;
        const key = movie.tmdb_id || movie.id;
        if (seen.has(key)) continue;
        seen.add(key);
        movies.push(movie);
      }
    }

    const availableMovies = await markProviderAvailability(movies);
    return {
      movies: availableMovies,
      genre,
      error: availableMovies.length === 0 ? "Sem resultados disponíveis para este gênero" : null,
    };
  } catch (error) {
    return { movies: [] as CatalogMovie[], genre: null as Genre | null, error: describeFetchError(error) };
  }
}

const CACHE_TTL_MS = 10 * 60 * 1000;
let catalogCache: {
  expiresAt: number;
  payload: { movies: CatalogMovie[]; genres: Genre[]; errors: string[] };
} | null = null;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim() ?? "";
  const movieId = searchParams.get("id")?.trim() ?? "";
  const listId = searchParams.get("list")?.trim() ?? "";
  const genreId = searchParams.get("genre")?.trim() ?? "";
  const browse = searchParams.get("browse")?.trim() ?? "";
  const kind = searchParams.get("kind") === "tv" ? "tv" : "movie";
  const page = Math.max(1, Number(searchParams.get("page") || "1") || 1);
  const season = Math.max(0, Number(searchParams.get("season") || "0") || 0);
  const maxMinutes = Math.max(0, Number(searchParams.get("maxMinutes") || "0") || 0);

  if (movieId && kind === "tv" && season > 0) {
    return Response.json(await getTmdbSeason(movieId, season));
  }

  if (movieId) {
    return Response.json(await getTmdbDetails(movieId, kind));
  }

  if (query) {
    return Response.json(await searchTmdb(query));
  }

  if (searchParams.get("genres") === "1") {
    const { list } = await fetchTmdbGenreMap(kind);
    return Response.json({ genres: list });
  }

  if (browse === "1" || browse === "az") {
    return Response.json(await browseCatalog(kind, page, genreId || undefined));
  }

  if (listId) {
    return Response.json(await fetchListPage(listId, page));
  }

  if ((genreId || searchParams.get("roulette") === "1") && searchParams.get("roulette") === "1") {
    const pages = Number(searchParams.get("pages") || "5") || 5;
    // genreId vazio ou "all" = top gerais (sem filtro de gênero)
    if (!genreId || genreId === "all" || genreId === "0") {
      return Response.json(await roulettePool("", kind, pages, maxMinutes || undefined));
    }
    return Response.json(await roulettePool(genreId, kind, pages, maxMinutes || undefined));
  }

  if (genreId) {
    return Response.json(await discoverByGenre(genreId, kind, page));
  }

  if (catalogCache && catalogCache.expiresAt > Date.now()) {
    return Response.json(catalogCache.payload);
  }

  const result = await fetchTmdbCatalog();
  const payload = {
    movies: result.movies,
    genres: result.genres,
    errors: result.error ? [result.error] : [],
  };
  catalogCache = { expiresAt: Date.now() + CACHE_TTL_MS, payload };
  return Response.json(payload);
}
