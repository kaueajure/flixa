import { mapStreamedMatch, mapStreamedStreams, STREAMED_ORIGIN, type SportsCatalogResponse } from "./sports-catalog.ts";
import { legacyCatalog } from "./legacy-sports-api.ts";

const cache = new Map<string, { expires: number; data: unknown[] }>();
const requests = new Map<string, Promise<unknown[]>>();

/** Cache successful empty responses too; coalesce simultaneous requests per endpoint. */
async function request(path: string, ttl: number): Promise<unknown[]> {
  const cached = cache.get(path);
  if (cached && cached.expires > Date.now()) return cached.data;
  const pending = requests.get(path);
  if (pending) return pending;
  const job = (async () => {
    const response = await fetch(`${STREAMED_ORIGIN}/api/${path}`, {
      headers: { Accept: "application/json", "User-Agent": "Flixa/1.0" },
      cache: "no-store", signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data: unknown = await response.json();
    if (!Array.isArray(data)) throw new Error("Resposta JSON inválida");
    if (cache.size >= 300) cache.delete(cache.keys().next().value!);
    cache.set(path, { expires: Date.now() + ttl, data });
    return data;
  })().finally(() => requests.delete(path));
  requests.set(path, job);
  return job;
}

let lastCatalog: SportsCatalogResponse | null = null;
let catalogRequest: Promise<SportsCatalogResponse> | null = null;
let catalogExpires = 0;

export async function getSportsCatalog(): Promise<SportsCatalogResponse> {
  if (lastCatalog && catalogExpires > Date.now()) return lastCatalog;
  if (catalogRequest) return catalogRequest;
  catalogRequest = (async () => {
    const paths = ["matches/all", "matches/live", "matches/football", "matches/basketball", "sports"];
    const [settled, legacy] = await Promise.all([
      Promise.allSettled(paths.map((path) => request(path, path === "sports" ? 3600000 : 60000))),
      legacyCatalog(),
    ]);
    const errors = [...legacy.errors];
    const lists = settled.map((result, index) => {
      if (result.status === "fulfilled") return result.value;
      errors.push(`Streamed ${paths[index]}: ${result.reason instanceof Error ? result.reason.message : "falha de conexão"}`);
      return cache.get(paths[index])?.data || [];
    });
    const liveIds = new Set(lists[1].flatMap((item) => {
      if (!item || typeof item !== "object" || !("id" in item) || typeof item.id !== "string") return [];
      return [item.id];
    }));
    const sportIds = new Set(lists[4].flatMap((item) => {
      if (!item || typeof item !== "object" || !("id" in item) || typeof item.id !== "string") return [];
      return [item.id];
    }));
    const unique = new Map<string, NonNullable<ReturnType<typeof mapStreamedMatch>>>();
    // Sport-specific feeds take precedence; the live feed can introduce new matches.
    for (const match of [...lists[0], ...lists[2], ...lists[3], ...lists[1]]) {
      const event = mapStreamedMatch(match, liveIds);
      if (!event || (sportIds.size && !sportIds.has(event.category!))) continue;
      const previous = unique.get(event.id);
      const refs = [...(previous?.streamRefs || []), ...(event.streamRefs || [])];
      unique.set(event.id, {
        ...event,
        streamRefs: refs.filter((ref, index) => refs.findIndex((item) => item.source === ref.source && item.id === ref.id) === index),
      });
    }
    const events = [...unique.values(), ...legacy.events].sort((a, b) => {
      const order = { live: 0, upcoming: 1, unknown: 2, replay: 3, finished: 4 };
      const status = order[a.status] - order[b.status];
      if (status) return status;
      return (Date.parse(a.startAt) || Infinity) - (Date.parse(b.startAt) || Infinity);
    });
    // Retain last known data on total discovery failure and expose the failure.
    const discoveryFailed = settled.slice(0, 4).every((result) => result.status === "rejected");
    const payload = {
      events: discoveryFailed && lastCatalog ? [...lastCatalog.events.filter((event) => event.streamRefs), ...legacy.events] : events,
      errors, updatedAt: discoveryFailed && lastCatalog ? lastCatalog.updatedAt : new Date().toISOString(),
      liveSourceConfigured: true,
    };
    lastCatalog = payload;
    catalogExpires = Date.now() + (errors.length ? 15000 : 60000);
    return payload;
  })().finally(() => { catalogRequest = null; });
  return catalogRequest;
}

export async function getMatchStreams(eventId: string) {
  const catalog = await getSportsCatalog();
  const event = catalog.events.find((item) => item.id === eventId && item.streamRefs);
  if (!event) return null;
  const refs = event.streamRefs || [];
  const results = await Promise.allSettled(refs.map((ref) => request(
    `stream/${encodeURIComponent(ref.source)}/${encodeURIComponent(ref.id)}`, 60000,
  ).then(mapStreamedStreams)));
  const errors: string[] = [];
  const sources = results.flatMap((result, index) => {
    if (result.status === "fulfilled") return result.value;
    errors.push(`${refs[index].source}: não foi possível carregar os streams`);
    return [];
  }).filter((source, index, all) => all.findIndex((item) => item.embedUrl === source.embedUrl) === index);
  return { sources, errors };
}
