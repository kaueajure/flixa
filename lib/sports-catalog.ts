export type SportsEventStatus = "live" | "upcoming" | "replay" | "finished";

export type SportsEvent = {
  id: string;
  title: string;
  competition: string;
  sport: string;
  startAt: string;
  status: SportsEventStatus;
  thumbnail?: string;
  venue?: string;
  homeTeam?: string;
  awayTeam?: string;
  homeScore?: number;
  awayScore?: number;
  sourceName: string;
  sourceUrl: string;
  embedUrl?: string;
  videoLabel?: string;
};

export type SportsCatalogResponse = {
  events: SportsEvent[];
  errors: string[];
  updatedAt: string;
  liveSourceConfigured: boolean;
};

export const SPORTS_LEAGUES = [
  { id: "4351", name: "Brasileirão Série A" },
  { id: "4328", name: "Premier League" },
  { id: "4480", name: "Champions League" },
  { id: "4387", name: "NBA" },
  { id: "4391", name: "NFL" },
  { id: "4380", name: "NHL" },
  { id: "4424", name: "MLB" },
  { id: "4370", name: "Fórmula 1" },
  { id: "4464", name: "ATP World Tour" },
] as const;

const SPORT_NAMES: Record<string, string> = {
  "American Football": "Futebol americano",
  Baseball: "Beisebol",
  Basketball: "Basquete",
  "Ice Hockey": "Hóquei no gelo",
  Motorsport: "Automobilismo",
  Soccer: "Futebol",
  Tennis: "Tênis",
};

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : null;
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function number(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}

function httpsUrl(value: unknown) {
  const raw = text(value);
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function eventTimestamp(event: UnknownRecord) {
  const timestamp = text(event.strTimestamp);
  if (timestamp) {
    const normalized = /(?:z|[+-]\d\d:\d\d)$/i.test(timestamp) ? timestamp : `${timestamp}Z`;
    const parsed = new Date(normalized);
    if (!Number.isNaN(parsed.valueOf())) return parsed.toISOString();
  }

  const date = text(event.dateEvent);
  if (!date) return new Date(0).toISOString();
  const time = text(event.strTime) || "00:00:00";
  const parsed = new Date(`${date}T${time}Z`);
  return Number.isNaN(parsed.valueOf()) ? new Date(`${date}T00:00:00Z`).toISOString() : parsed.toISOString();
}

function youtubeVideo(value: unknown) {
  const raw = text(value);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    let id = "";
    if (url.hostname === "youtu.be") id = url.pathname.slice(1).split("/")[0];
    if (/(^|\.)youtube\.com$/i.test(url.hostname)) {
      id = url.searchParams.get("v") || url.pathname.match(/^\/(?:embed|shorts|live)\/([^/?]+)/)?.[1] || "";
    }
    if (!/^[\w-]{6,20}$/.test(id)) return null;
    return {
      sourceUrl: `https://www.youtube.com/watch?v=${id}`,
      embedUrl: `https://www.youtube-nocookie.com/embed/${id}?rel=0`,
    };
  } catch {
    return null;
  }
}

function scoreBatEmbed(value: unknown) {
  const html = text(value);
  const src = html?.match(/<iframe[^>]+src=["']([^"']+)["']/i)?.[1]
    ?.replaceAll("&amp;", "&");
  if (!src) return undefined;
  try {
    const url = new URL(src);
    if (url.protocol !== "https:" || !/(^|\.)scorebat\.com$/i.test(url.hostname)) return undefined;
    url.searchParams.set("autoplay", "1");
    return url.toString();
  } catch {
    return undefined;
  }
}

export function mapSportsDbEvent(value: unknown, period: "upcoming" | "past"): SportsEvent | null {
  const event = record(value);
  const id = text(event?.idEvent);
  const title = text(event?.strEvent);
  if (!event || !id || !title) return null;

  const video = youtubeVideo(event.strVideo);
  const statusText = `${text(event.strStatus) || ""} ${text(event.strProgress) || ""}`;
  const isLive = /\b(?:live|1h|2h|3h|q[1-4]|in progress|halftime|ht)\b/i.test(statusText);
  const status: SportsEventStatus = isLive
    ? "live"
    : period === "upcoming"
      ? "upcoming"
      : video
        ? "replay"
        : "finished";

  return {
    id: `sportsdb-${id}`,
    title,
    competition: text(event.strLeague) || "Competição",
    sport: SPORT_NAMES[text(event.strSport) || ""] || text(event.strSport) || "Esporte",
    startAt: eventTimestamp(event),
    status,
    thumbnail: httpsUrl(event.strThumb) || httpsUrl(event.strPoster) || httpsUrl(event.strLeagueBadge),
    venue: text(event.strVenue),
    homeTeam: text(event.strHomeTeam),
    awayTeam: text(event.strAwayTeam),
    homeScore: number(event.intHomeScore),
    awayScore: number(event.intAwayScore),
    sourceName: video ? "YouTube · via TheSportsDB" : "TheSportsDB",
    sourceUrl: video?.sourceUrl || `https://www.thesportsdb.com/event/${encodeURIComponent(id)}`,
    embedUrl: video?.embedUrl,
    videoLabel: video ? "Vídeo informado para o evento" : undefined,
  };
}

export function mapScoreBatEvent(value: unknown, feed: "live" | "highlights", now = new Date()): SportsEvent | null {
  const match = record(value);
  const title = text(match?.title);
  const date = text(match?.date);
  if (!match || !title || !date) return null;

  const startAt = new Date(date.replace(/([+-]\d\d)(\d\d)$/, "$1:$2"));
  if (Number.isNaN(startAt.valueOf())) return null;
  const videos = Array.isArray(match.videos) ? match.videos.map(record).filter(Boolean) as UnknownRecord[] : [];
  const selectedVideo = videos.find((video) => scoreBatEmbed(video.embed));
  const embedUrl = scoreBatEmbed(selectedVideo?.embed);
  if (!embedUrl) return null;

  const sourceUrl = httpsUrl(match.matchviewUrl) || embedUrl;
  const recentLiveWindow = startAt.valueOf() <= now.valueOf() && startAt.valueOf() > now.valueOf() - 6 * 60 * 60 * 1000;
  const status: SportsEventStatus = feed === "live" && recentLiveWindow ? "live" : "replay";
  const home = record(match.homeTeam);
  const away = record(match.awayTeam);
  const stableId = text(selectedVideo?.id) || `${startAt.toISOString()}-${title}`.toLowerCase().replace(/[^a-z0-9]+/g, "-");

  return {
    id: `scorebat-${stableId}`,
    title,
    competition: text(match.competition) || "Futebol",
    sport: "Futebol",
    startAt: startAt.toISOString(),
    status,
    thumbnail: httpsUrl(match.thumbnail),
    homeTeam: text(home?.name),
    awayTeam: text(away?.name),
    sourceName: "ScoreBat · fonte oficial",
    sourceUrl,
    embedUrl,
    videoLabel: status === "live" ? "Transmissão oficial ao vivo" : text(selectedVideo?.title) || "Vídeo oficial",
  };
}

export function dedupeSportsEvents(events: SportsEvent[]) {
  const seen = new Set<string>();
  return events.filter((event) => {
    const key = `${event.title.toLocaleLowerCase("pt-BR").replace(/\W/g, "")}:${event.startAt.slice(0, 10)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
