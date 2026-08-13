export type ProviderMediaKind = "movie" | "tv";

const PROVIDER_ORIGIN = "https://superflixapi.pro";
const PROVIDER_CACHE_TTL_MS = 30 * 60 * 1000;
const PROVIDER_STALE_TTL_MS = 6 * 60 * 60 * 1000;

type ProviderInventoryCache = {
  ids: Set<string>;
  fetchedAt: number;
  expiresAt: number;
};

const inventoryCache = new Map<ProviderMediaKind, ProviderInventoryCache>();
const inventoryRequests = new Map<ProviderMediaKind, Promise<Set<string>>>();

function providerCategory(kind: ProviderMediaKind) {
  return kind === "tv" ? "serie" : "filme";
}

function normalizeProviderIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item ?? "").trim())
    .filter((id) => /^\d+$/.test(id));
}

async function requestProviderInventory(kind: ProviderMediaKind) {
  const url = new URL("/lista", PROVIDER_ORIGIN);
  url.searchParams.set("category", providerCategory(kind));
  url.searchParams.set("type", "tmdb");
  url.searchParams.set("format", "json");
  url.searchParams.set("order", "asc");

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "Flixa/1.0",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    throw new Error(`catálogo do player respondeu HTTP ${response.status}`);
  }

  const ids = normalizeProviderIds(await response.json());
  if (ids.length === 0) {
    throw new Error("catálogo do player retornou vazio");
  }

  const now = Date.now();
  const inventory = new Set(ids);
  inventoryCache.set(kind, {
    ids: inventory,
    fetchedAt: now,
    expiresAt: now + PROVIDER_CACHE_TTL_MS,
  });
  return inventory;
}

/**
 * Inventário público do player, indexado pelos IDs do TMDB.
 *
 * A aplicação falha fechada: sem um inventário atual (ou um último valor
 * válido recente), nenhum título é tratado como reproduzível.
 */
export async function getProviderInventory(kind: ProviderMediaKind) {
  const cached = inventoryCache.get(kind);
  if (cached && cached.expiresAt > Date.now()) return cached.ids;

  const pending = inventoryRequests.get(kind);
  if (pending) return pending;

  const request = requestProviderInventory(kind)
    .catch((error) => {
      const stale = inventoryCache.get(kind);
      if (stale && stale.fetchedAt + PROVIDER_STALE_TTL_MS > Date.now()) {
        return stale.ids;
      }
      throw error;
    })
    .finally(() => {
      inventoryRequests.delete(kind);
    });

  inventoryRequests.set(kind, request);
  return request;
}

export async function isProviderTitleAvailable(kind: ProviderMediaKind, tmdbId: string) {
  if (!/^\d+$/.test(tmdbId)) return false;
  const inventory = await getProviderInventory(kind);
  return inventory.has(tmdbId);
}
