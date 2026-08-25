export type SportsEventStatus = "live" | "upcoming" | "replay" | "finished";

export const SPORTS_VIDEO_PROVIDERS = [
  { id: "youtube", name: "YouTube" },
  { id: "scorebat", name: "ScoreBat" },
  { id: "twitch", name: "Twitch" },
  { id: "dailymotion", name: "Dailymotion" },
  { id: "vimeo", name: "Vimeo" },
] as const;

export type SportsVideoProviderId = typeof SPORTS_VIDEO_PROVIDERS[number]["id"];

export type SportsVideoSource = {
  id: string;
  providerId: SportsVideoProviderId;
  name: string;
  sourceUrl: string;
  embedUrl: string;
  label: string;
};

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
  sources: SportsVideoSource[];
  /** @deprecated Use sources; kept for compatibility with older clients. */
  embedUrl?: string;
  /** @deprecated Use sources; kept for compatibility with older clients. */
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

function sourceId(providerId: SportsVideoProviderId, value: string) {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `${providerId}-${(hash >>> 0).toString(36)}`;
}

function videoSource(
  providerId: SportsVideoProviderId,
  sourceUrl: string,
  embedUrl: string,
  label?: string,
): SportsVideoSource {
  const provider = SPORTS_VIDEO_PROVIDERS.find((item) => item.id === providerId)!;
  return {
    id: sourceId(providerId, embedUrl),
    providerId,
    name: provider.name,
    sourceUrl,
    embedUrl,
    label: label || `Vídeo no ${provider.name}`,
  };
}

function iframeSource(value: unknown) {
  const raw = text(value);
  if (!raw) return undefined;
  return raw.match(/<iframe[^>]+src=["']([^"']+)["']/i)?.[1]?.replaceAll("&amp;", "&") || raw;
}

/**
 * Converts only official, explicitly supported video URLs into iframe URLs.
 * It does not discover streams or bypass publisher, region or subscription rules.
 */
export function mapSportsVideoSource(value: unknown, label?: string): SportsVideoSource | null {
  const raw = iframeSource(value);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return null;

    let id = "";
    if (url.hostname === "youtu.be") id = url.pathname.slice(1).split("/")[0] || "";
    if (/(^|\.)youtube\.com$/i.test(url.hostname)) {
      id = url.searchParams.get("v") || url.pathname.match(/^\/(?:embed|shorts|live)\/([^/?]+)/)?.[1] || "";
    }
    if (/^[\w-]{6,20}$/.test(id)) {
      return videoSource(
        "youtube",
        `https://www.youtube.com/watch?v=${id}`,
        `https://www.youtube-nocookie.com/embed/${id}?rel=0`,
        label || "Vídeo informado para o evento",
      );
    }

    if (/(^|\.)scorebat\.com$/i.test(url.hostname)) {
      url.searchParams.set("autoplay", "1");
      return videoSource("scorebat", url.toString(), url.toString(), label || "Vídeo oficial");
    }

    if (/(^|\.)twitch\.tv$/i.test(url.hostname)) {
      const videoId = url.hostname === "player.twitch.tv"
        ? (url.searchParams.get("video") || "").replace(/^v/, "")
        : url.pathname.match(/^\/videos\/(\d+)/)?.[1] || "";
      const rawChannel = url.hostname === "player.twitch.tv"
        ? url.searchParams.get("channel") || ""
        : url.pathname.split("/").filter(Boolean)[0] || "";
      const reserved = /^(?:directory|downloads|jobs|p|search|settings|videos)$/i;
      const channel = reserved.test(rawChannel) ? "" : rawChannel;
      if (/^\d{3,20}$/.test(videoId)) {
        return videoSource(
          "twitch",
          `https://www.twitch.tv/videos/${videoId}`,
          `https://player.twitch.tv/?video=v${videoId}&autoplay=false`,
          label,
        );
      }
      if (/^[a-z0-9_]{2,50}$/i.test(channel)) {
        return videoSource(
          "twitch",
          `https://www.twitch.tv/${channel}`,
          `https://player.twitch.tv/?channel=${encodeURIComponent(channel)}&autoplay=false`,
          label || "Canal oficial",
        );
      }
    }

    let dailymotionId = "";
    if (url.hostname === "dai.ly") dailymotionId = url.pathname.split("/").filter(Boolean)[0] || "";
    if (/(^|\.)dailymotion\.com$/i.test(url.hostname)) {
      dailymotionId = url.searchParams.get("video")
        || url.pathname.match(/^\/(?:embed\/)?video\/([\w-]+)/)?.[1]
        || "";
    }
    if (/^[a-z0-9]{5,20}$/i.test(dailymotionId)) {
      return videoSource(
        "dailymotion",
        `https://www.dailymotion.com/video/${dailymotionId}`,
        `https://www.dailymotion.com/embed/video/${dailymotionId}?autoplay=0`,
        label,
      );
    }

    if (/(^|\.)vimeo\.com$/i.test(url.hostname)) {
      const match = url.pathname.match(/\/(?:video\/)?(\d{5,20})(?:\/|$)/);
      const videoId = match?.[1] || "";
      if (videoId) {
        const privacyHash = url.searchParams.get("h");
        const query = privacyHash && /^[a-z0-9]+$/i.test(privacyHash) ? `?h=${privacyHash}` : "";
        return videoSource(
          "vimeo",
          `https://vimeo.com/${videoId}${query}`,
          `https://player.vimeo.com/video/${videoId}${query}`,
          label,
        );
      }
    }
  } catch {
    return null;
  }
  return null;
}

function scoreBatEmbed(value: unknown) {
  const source = mapSportsVideoSource(value);
  return source?.providerId === "scorebat" ? source : undefined;
}

export function mapSportsDbEvent(value: unknown, period: "upcoming" | "past"): SportsEvent | null {
  const event = record(value);
  const id = text(event?.idEvent);
  const title = text(event?.strEvent);
  if (!event || !id || !title) return null;

  const video = mapSportsVideoSource(event.strVideo);
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
    sourceName: video ? `${video.name} · via TheSportsDB` : "TheSportsDB",
    sourceUrl: video?.sourceUrl || `https://www.thesportsdb.com/event/${encodeURIComponent(id)}`,
    sources: video ? [video] : [],
    embedUrl: video?.embedUrl,
    videoLabel: video?.label,
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
  const rawSource = scoreBatEmbed(selectedVideo?.embed);
  if (!rawSource) return null;

  const sourceUrl = httpsUrl(match.matchviewUrl) || rawSource.sourceUrl;
  const recentLiveWindow = startAt.valueOf() <= now.valueOf() && startAt.valueOf() > now.valueOf() - 6 * 60 * 60 * 1000;
  const status: SportsEventStatus = feed === "live" && recentLiveWindow ? "live" : "replay";
  const home = record(match.homeTeam);
  const away = record(match.awayTeam);
  const stableId = text(selectedVideo?.id) || `${startAt.toISOString()}-${title}`.toLowerCase().replace(/[^a-z0-9]+/g, "-");

  const videoLabel = status === "live" ? "Transmissão oficial ao vivo" : text(selectedVideo?.title) || "Vídeo oficial";
  const source = { ...rawSource, sourceUrl, label: videoLabel };

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
    sources: [source],
    embedUrl: source.embedUrl,
    videoLabel,
  };
}

export function addSportsVideoSource(event: SportsEvent, value: unknown, label?: string) {
  const source = mapSportsVideoSource(value, label);
  if (!source) return event;
  const sources = [...event.sources, source].filter((item, index, all) => (
    all.findIndex((candidate) => candidate.providerId === item.providerId && candidate.embedUrl === item.embedUrl) === index
  ));
  const primary = sources[0];
  return {
    ...event,
    sources,
    status: event.status === "finished" ? "replay" : event.status,
    embedUrl: primary?.embedUrl,
    videoLabel: primary?.label,
  };
}

export function dedupeSportsEvents(events: SportsEvent[]) {
  const unique = new Map<string, SportsEvent>();
  for (const event of events) {
    const key = `${event.title.toLocaleLowerCase("pt-BR").replace(/\W/g, "")}:${event.startAt.slice(0, 10)}`;
    const current = unique.get(key);
    if (!current) {
      unique.set(key, event);
      continue;
    }
    const sources = [...current.sources, ...event.sources].filter((item, index, all) => (
      all.findIndex((candidate) => candidate.providerId === item.providerId && candidate.embedUrl === item.embedUrl) === index
    ));
    const primary = sources[0];
    unique.set(key, {
      ...current,
      sources,
      sourceName: sources.length > 1 ? `${sources.length} fontes oficiais` : current.sourceName,
      sourceUrl: primary?.sourceUrl || current.sourceUrl,
      embedUrl: primary?.embedUrl,
      videoLabel: primary?.label,
    });
  }
  return [...unique.values()];
}
