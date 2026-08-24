import {
  SPORTS_LEAGUES,
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
  const events: SportsEvent[] = [];
  settled.forEach((result, index) => {
    if (result.status === "fulfilled") events.push(...result.value);
    else errors.push(`${jobs[index].label}: ${message(result.reason)}`);
  });

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
    liveSourceConfigured: Boolean(scoreBatToken),
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
