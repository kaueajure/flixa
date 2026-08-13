import { getProviderInventory, type ProviderMediaKind } from "../provider";

export const dynamic = "force-dynamic";

type AvailabilityItem = {
  kind?: unknown;
  tmdb_id?: unknown;
  id?: unknown;
};

function mediaKind(value: unknown): ProviderMediaKind {
  return value === "tv" ? "tv" : "movie";
}

function tmdbId(item: AvailabilityItem) {
  const explicit = String(item.tmdb_id ?? "").trim();
  if (/^\d+$/.test(explicit)) return explicit;
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

  try {
    const neededKinds = new Set(items.map((item) => mediaKind(item.kind)));
    const inventories = new Map<ProviderMediaKind, Set<string>>();
    await Promise.all(
      [...neededKinds].map(async (kind) => {
        inventories.set(kind, await getProviderInventory(kind));
      }),
    );

    const available = items.flatMap((item) => {
      const kind = mediaKind(item.kind);
      const id = tmdbId(item);
      return /^\d+$/.test(id) && inventories.get(kind)?.has(id) ? [`${kind}:${id}`] : [];
    });

    return Response.json({ available: [...new Set(available)] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "inventário indisponível";
    return Response.json({ available: [], error: message }, { status: 503 });
  }
}
