import { getProviderInventory } from "../provider";

export const dynamic = "force-dynamic";

type MediaKind = "movie" | "tv";

type AvailabilityItem = {
  kind?: unknown;
  tmdb_id?: unknown;
  imdb_id?: unknown;
  id?: unknown;
};

function mediaKind(value: unknown): MediaKind {
  return value === "tv" ? "tv" : "movie";
}

function mediaId(item: AvailabilityItem) {
  const tmdbId = String(item.tmdb_id ?? "").trim();
  if (/^\d+$/.test(tmdbId)) return tmdbId;
  const imdbId = String(item.imdb_id ?? "").trim();
  if (/^tt\d+$/i.test(imdbId)) return imdbId;
  return String(item.id ?? "").trim().replace(/^(?:movie-|tv-)/i, "");
}

export async function POST(request: Request) {
  let body: { items?: AvailabilityItem[] };
  try {
    body = (await request.json()) as { items?: AvailabilityItem[] };
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }

  const items = Array.isArray(body.items) ? body.items.slice(0, 300) : [];
  if (items.length === 0) return Response.json({ available: [] });

  const available = items.flatMap((item) => {
    const kind = mediaKind(item.kind);
    const id = mediaId(item);
    return /^\d+$|^tt\d+$/i.test(id) ? [`${kind}:${id}`] : [];
  });

  const providerAvailable: string[] = [];
  const neededKinds = [...new Set(items.map((item) => mediaKind(item.kind)))];
  const entries = await Promise.all(
    neededKinds.map(async (kind) => {
      try {
        return [kind, await getProviderInventory(kind)] as const;
      } catch {
        return [kind, new Set<string>()] as const;
      }
    }),
  );
  const inventories = new Map(entries);
  items.forEach((item) => {
    const kind = mediaKind(item.kind);
    const id = mediaId(item);
    if (/^\d+$/.test(id) && inventories.get(kind)?.has(id)) {
      providerAvailable.push(`${kind}:${id}`);
    }
  });

  return Response.json({
    available: [...new Set(available)],
    provider_available: [...new Set(providerAvailable)],
  });
}
