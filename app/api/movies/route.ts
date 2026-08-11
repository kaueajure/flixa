export const dynamic = "force-dynamic";

type CatalogMovie = {
  id: string;
  source: string;
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
};

const API_SOURCES = [
  {
    name: "YTS",
    host: "yts-am-torrent.p.rapidapi.com",
    url: "https://yts-am-torrent.p.rapidapi.com/list_movies.json?limit=20&sort_by=download_count&with_rt_ratings=true",
  },
];

function getRapidApiKey() {
  return process.env.RAPIDAPI_KEY || process.env.NEXT_PUBLIC_RAPIDAPI_KEY || "";
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
      item.movie_title ||
      item.Title ||
      item.movieName,
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

  const preferred = [
    "movies",
    "results",
    "Search",
    "films",
    "items",
    "data",
    "result",
    "hits",
    "rows",
    "list",
    "records",
  ];

  for (const key of preferred) {
    if (key in obj) {
      const found = findMovieItems(obj[key], depth + 1);
      if (found.length > 0) return found;
    }
  }

  for (const value of Object.values(obj)) {
    const found = findMovieItems(value, depth + 1);
    if (found.length > 0) return found;
  }

  return [];
}

function extractApiMessage(data: unknown): string | null {
  const obj = asRecord(data);
  if (!obj) return null;
  return (
    asString(obj.message) ||
    asString(obj.error) ||
    asString(obj.status_message) ||
    null
  );
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    const text = asString(value);
    if (text) return text;
  }
  return null;
}

function asImageUrl(value: unknown): string | null {
  const text = asString(value);
  if (text) {
    if (text.startsWith("http://") || text.startsWith("https://")) return text;
    if (text.startsWith("//")) return `https:${text}`;
    if (text.startsWith("/")) return `https://image.tmdb.org/t/p/w500${text}`;
  }

  const obj = asRecord(value);
  if (!obj) return null;
  return asImageUrl(obj.url || obj.src || obj.large || obj.medium || obj.original || obj.path);
}

function cssImage(url: string | null) {
  return url ? `url('${url.replace(/'/g, "%27")}')` : "linear-gradient(135deg, #121b33 0%, #020205 100%)";
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
  if (text) {
    return text.split(/[,|/]/).map((item) => item.trim()).filter(Boolean);
  }

  return [];
}

function isPlayableVideoUrl(value: string) {
  if (!/^https?:\/\//i.test(value)) return false;
  if (/magnet:|\.torrent(\?|$)/i.test(value)) return false;
  return /\.(mp4|webm|ogg|ogv|m3u8|mpd)(\?|$)/i.test(value);
}

function asVideoUrl(movie: Record<string, unknown>): string | undefined {
  const candidates = [
    movie.video_url,
    movie.stream_url,
    movie.streamUrl,
    movie.mp4,
    movie.video,
    movie.videoUrl,
    movie.playback_url,
    movie.hls,
    movie.hlsUrl,
  ];

  for (const candidate of candidates) {
    const url = asString(candidate);
    if (url && isPlayableVideoUrl(url)) return url;
  }

  return undefined;
}

function asTrailer(movie: Record<string, unknown>): string | undefined {
  const trailerUrl = firstString(movie.trailer, movie.trailer_url, movie.trailerUrl);
  if (trailerUrl) {
    if (/youtube\.com|youtu\.be/i.test(trailerUrl)) {
      const id = trailerUrl.match(/(?:v=|youtu\.be\/|embed\/)([A-Za-z0-9_-]{6,})/)?.[1];
      return id ? `https://www.youtube.com/embed/${id}` : trailerUrl;
    }
    if (isPlayableVideoUrl(trailerUrl) || trailerUrl.startsWith("https://")) return trailerUrl;
  }

  const youtubeId = firstString(movie.yt_trailer_code, movie.youtube_id, movie.youtubeId);
  if (youtubeId) return `https://www.youtube.com/embed/${youtubeId}`;

  return undefined;
}

function asRating(movie: Record<string, unknown>): string | undefined {
  const direct = [
    movie.rating,
    movie.vote_average,
    movie.imdb_rating,
    movie.imdbRating,
    movie.imdb,
    movie.rt_rating,
    movie.tomatoes,
    movie.score,
    movie.Rated,
  ];

  for (const value of direct) {
    const numeric = asNumber(value);
    if (numeric != null) return String(numeric);
    const text = asString(value);
    if (text) return text;
  }

  const list = movie.ratings ?? movie.Ratings;
  if (Array.isArray(list)) {
    const parts = list
      .map((entry) => {
        if (typeof entry === "string") return entry;
        const obj = asRecord(entry);
        if (!obj) return null;
        const source = firstString(obj.Source, obj.source, obj.name);
        const score = firstString(obj.Value, obj.value, obj.rating, obj.score);
        if (source && score) return `${source}: ${score}`;
        return score;
      })
      .filter((item): item is string => Boolean(item));
    if (parts.length > 0) return parts.join(" · ");
  }

  return undefined;
}

function asYear(movie: Record<string, unknown>): number | undefined {
  const year = asNumber(movie.year) ?? asNumber(movie.Year);
  if (year && year > 1800 && year < 3000) return Math.round(year);

  const released = firstString(movie.release_date, movie.released, movie.Released, movie.date);
  if (released) {
    const parsed = new Date(released).getFullYear();
    if (Number.isFinite(parsed) && parsed > 1800) return parsed;
  }

  return undefined;
}

function asDuration(runtime: unknown): { duration?: string; durationSeconds?: number } {
  const text = asString(runtime);
  if (text && /h|min|hr/i.test(text)) {
    const hours = Number(text.match(/(\d+)\s*h/i)?.[1] ?? 0);
    const minutes = Number(text.match(/(\d+)\s*min/i)?.[1] ?? 0);
    const total = hours * 60 + minutes;
    if (total > 0) {
      return { duration: text, durationSeconds: total * 60 };
    }
  }

  const numeric = asNumber(runtime);
  if (numeric && numeric > 0) {
    const minutes = numeric > 1000 ? Math.round(numeric / 60) : Math.round(numeric);
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return {
      duration: `${hours}h ${String(rest).padStart(2, "0")}min`,
      durationSeconds: minutes * 60,
    };
  }

  return {};
}

function parseApiResponse(sourceName: string, data: unknown): CatalogMovie[] {
  return findMovieItems(data).flatMap((movie, index) => {
    const title = firstString(movie.title, movie.name, movie.original_title, movie.Title, movie.movie_title);
    if (!title) return [];

    const poster = asImageUrl(
      movie.large_cover_image ||
        movie.medium_cover_image ||
        movie.poster_path ||
        movie.poster_url ||
        movie.Poster ||
        movie.poster ||
        movie.image ||
        movie.cover ||
        movie.thumbnail,
    );
    const backdrop = asImageUrl(
      movie.background_image_original ||
        movie.background_image ||
        movie.backdrop_path ||
        movie.backdrop_url ||
        movie.backdrop ||
        poster,
    );
    const { duration, durationSeconds } = asDuration(movie.runtime ?? movie.Runtime ?? movie.duration);
    const idValue = firstString(movie.id, movie.imdb_id, movie.imdbID) ?? String(index);
    const cast = asGenres(movie.cast ?? movie.actors ?? movie.Actors);

    return [{
      id: `${sourceName.toLowerCase().replace(/\s+/g, "-")}-${idValue}`,
      source: sourceName,
      title,
      description: firstString(
        movie.summary,
        movie.synopsis,
        movie.overview,
        movie.description_full,
        movie.description,
        movie.Plot,
      ) ?? undefined,
      poster: cssImage(poster),
      backdrop: cssImage(backdrop),
      videoUrl: asVideoUrl(movie),
      duration,
      durationSeconds,
      year: asYear(movie),
      genres: asGenres(movie.genres ?? movie.genre ?? movie.Genre),
      rating: asRating(movie),
      director: firstString(movie.director, movie.Director) ?? undefined,
      cast: cast.length > 0 ? cast : undefined,
      trailer: asTrailer(movie),
    }];
  });
}

function describeFetchError(error: unknown) {
  const message = error instanceof Error ? error.message : "Conexão";
  if (/dns|name or service not known|internal error/i.test(message)) {
    return "DNS/conexão bloqueada";
  }
  return message;
}

async function fetchSource(api: (typeof API_SOURCES)[number], rapidApiKey: string) {
  const headers: HeadersInit = {
    Accept: "application/json",
    "User-Agent": "Flixa/1.0",
  };

  if (api.host) {
    if (!rapidApiKey) {
      return { movies: [] as CatalogMovie[], error: `${api.name}: chave RapidAPI ausente` };
    }
    headers["x-rapidapi-key"] = rapidApiKey;
    headers["x-rapidapi-host"] = api.host;
  }

  let res: Response;
  try {
    res = await fetch(api.url, {
      method: "GET",
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
  } catch (error) {
    return { movies: [] as CatalogMovie[], error: `${api.name}: ${describeFetchError(error)}` };
  }

  const payload = await res.text();
  let data: unknown = null;
  try {
    data = payload ? JSON.parse(payload) : null;
  } catch {
    return { movies: [] as CatalogMovie[], error: `${api.name}: resposta inválida (${res.status})` };
  }

  if (!res.ok) {
    const message = extractApiMessage(data);
    return {
      movies: [] as CatalogMovie[],
      error: `${api.name}: ${res.status}${message ? ` (${message})` : ""}`,
    };
  }

  const movies = parseApiResponse(api.name, data);
  if (movies.length === 0) {
    const message = extractApiMessage(data);
    return {
      movies,
      error: `${api.name}: ${message ?? "Sem resultados"}`,
    };
  }

  return { movies, error: null as string | null };
}

const CACHE_TTL_MS = 10 * 60 * 1000;
let catalogCache: { expiresAt: number; payload: { movies: CatalogMovie[]; errors: string[] } } | null = null;

export async function GET() {
  if (catalogCache && catalogCache.expiresAt > Date.now()) {
    return Response.json(catalogCache.payload);
  }

  const rapidApiKey = getRapidApiKey();
  const results = await Promise.allSettled(
    API_SOURCES.map((api) => fetchSource(api, rapidApiKey)),
  );

  const movies: CatalogMovie[] = [];
  const errors: string[] = [];

  results.forEach((result, index) => {
    if (result.status === "fulfilled") {
      movies.push(...result.value.movies);
      if (result.value.error) errors.push(result.value.error);
      return;
    }

    errors.push(`${API_SOURCES[index].name}: ${describeFetchError(result.reason)}`);
  });

  movies.sort(() => Math.random() - 0.5);

  const payload = { movies, errors };
  catalogCache = { expiresAt: Date.now() + CACHE_TTL_MS, payload };
  return Response.json(payload);
}
