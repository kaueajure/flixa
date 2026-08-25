import {
  SPORTS_LEAGUES,
  addSportsVideoSource,
  dedupeSportsEvents,
  mapScoreBatEvent,
  mapSportsDbEvent,
  type SportsCatalogResponse,
  type SportsEvent,
} from "../../../lib/sports-catalog";

export const dynamic = "force-dynamic";

const SPORTS_DB_ORIGIN = "https://www.thesportsdb.com";
const SCOREBAT_ORIGIN = "https://www.scorebat.com";
const CACHE_TTL_MS = 5 * 60 * 1000;

let catalogCache: { expiresAt: number; payload: SportsCatalogResponse } | null = null;
let catalogRequest: Promise<SportsCatalogResponse> | null = null;

function message(error: unknown) {
  return error instanceof Error ? error.message : "falha de conexão";
}

async function jsonRequest(url: URL) {
  const response = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "Flixa/1.0" },
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json() as Promise<unknown>;
}

function records(value: unknown, key: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const list = (value as Record<string, unknown>)[key];
  return Array.isArray(list) ? list : [];
}

async function sportsDbLeague(leagueId: string, period: "upcoming" | "past") {
  const apiKey = process.env.SPORTSDB_API_KEY?.trim() || "123";
  const endpoint = period === "upcoming" ? "eventsnextleague.php" : "eventspastleague.php";
  const url = new URL(`/api/v1/json/${encodeURIComponent(apiKey)}/${endpoint}`, SPORTS_DB_ORIGIN);
  url.searchParams.set("id", leagueId);
  const data = await jsonRequest(url);
  return records(data, "events")
    .map((event) => mapSportsDbEvent(event, period))
    .filter((event): event is SportsEvent => Boolean(event));
}

async function scoreBatFeed(feed: "live" | "highlights", token: string) {
  const endpoint = feed === "live" ? "live-streams" : "free-feed";
  const url = new URL(`/video-api/v3/${endpoint}/`, SCOREBAT_ORIGIN);
  url.searchParams.set("token", token);
  const data = await jsonRequest(url);
  return records(data, "response")
    .map((event) => mapScoreBatEvent(event, feed))
    .filter((event): event is SportsEvent => Boolean(event));
}

type AuthorizedEmbed = { eventId: string; url: string; label?: string };

function authorizedEmbedRecords(value: unknown): AuthorizedEmbed[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const entry = item as Record<string, unknown>;
    const eventId = typeof entry.eventId === "string" ? entry.eventId.trim() : "";
    const url = typeof entry.url === "string" ? entry.url.trim() : "";
    const label = typeof entry.label === "string" ? entry.label.trim() : undefined;
    return eventId && url ? [{ eventId, url, label }] : [];
  });
}

async function authorizedEmbeds() {
  const entries: AuthorizedEmbed[] = [];
  const inline = process.env.SPORTS_AUTHORIZED_EMBEDS_JSON?.trim();
  if (inline) {
    try {
      entries.push(...authorizedEmbedRecords(JSON.parse(inline)));
    } catch {
      throw new Error("SPORTS_AUTHORIZED_EMBEDS_JSON contém JSON inválido");
    }
  }

  const feed = process.env.SPORTS_AUTHORIZED_EMBEDS_URL?.trim();
  if (feed) {
    const url = new URL(feed);
    if (url.protocol !== "https:") throw new Error("SPORTS_AUTHORIZED_EMBEDS_URL precisa usar HTTPS");
    entries.push(...authorizedEmbedRecords(await jsonRequest(url)));
  }
  return entries;
}

async function buildCatalog(): Promise<SportsCatalogResponse> {
  const errors: string[] = [];
  const scoreBatToken = process.env.SCOREBAT_API_TOKEN?.trim() || "";
  const jobs: { label: string; request: Promise<SportsEvent[]> }[] = SPORTS_LEAGUES.flatMap((league) => [
    { label: `${league.name} (próximos)`, request: sportsDbLeague(league.id, "upcoming") },
    { label: `${league.name} (passados)`, request: sportsDbLeague(league.id, "past") },
  ]);

  if (scoreBatToken) {
    jobs.unshift(
      { label: "ScoreBat ao vivo", request: scoreBatFeed("live", scoreBatToken) },
      { label: "ScoreBat destaques", request: scoreBatFeed("highlights", scoreBatToken) },
    );
  }

  const settled = await Promise.allSettled(jobs.map((job) => job.request));
  let events: SportsEvent[] = [];
  settled.forEach((result, index) => {
    if (result.status === "fulfilled") events.push(...result.value);
    else errors.push(`${jobs[index].label}: ${message(result.reason)}`);
  });

  try {
    const configured = await authorizedEmbeds();
    if (configured.length) {
      const byEvent = new Map<string, AuthorizedEmbed[]>();
      for (const entry of configured) {
        byEvent.set(entry.eventId, [...(byEvent.get(entry.eventId) || []), entry]);
      }
      events = events.map((event) => (
        (byEvent.get(event.id) || []).reduce(
          (current, entry) => addSportsVideoSource(current, entry.url, entry.label),
          event,
        )
      ));
    }
  } catch (error) {
    errors.push(`Embeds autorizados: ${message(error)}`);
  }

  const statusOrder = { live: 0, upcoming: 1, replay: 2, finished: 3 } as const;
  const unique = dedupeSportsEvents(events).sort((left, right) => {
    const byStatus = statusOrder[left.status] - statusOrder[right.status];
    if (byStatus) return byStatus;
    const byDate = new Date(left.startAt).valueOf() - new Date(right.startAt).valueOf();
    return left.status === "upcoming" ? byDate : -byDate;
  });

  return {
    events: unique,
    errors,
    updatedAt: new Date().toISOString(),
    liveSourceConfigured: Boolean(
      scoreBatToken
      || process.env.SPORTS_AUTHORIZED_EMBEDS_JSON?.trim().replace(/^\[\s*\]$/, "")
      || process.env.SPORTS_AUTHORIZED_EMBEDS_URL?.trim(),
    ),
  };
}

async function getCatalog() {
  if (catalogCache && catalogCache.expiresAt > Date.now()) return catalogCache.payload;
  if (catalogRequest) return catalogRequest;

  catalogRequest = buildCatalog()
    .then((payload) => {
      if (payload.events.length > 0) {
        catalogCache = { expiresAt: Date.now() + CACHE_TTL_MS, payload };
      }
      return payload;
    })
    .finally(() => {
      catalogRequest = null;
    });
  return catalogRequest;
}

export async function GET() {
  const payload = await getCatalog();
  return Response.json(payload, {
    status: payload.events.length > 0 ? 200 : 502,
    headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" },
  });
}
