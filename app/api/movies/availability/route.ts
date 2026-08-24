import { listarServidoresDesabilitados } from "../../../../db/player-servers";
import { DEFAULT_DISABLED_PLAYER_SERVER_IDS, PLAYER_SERVERS } from "../../../../lib/player-servers";

export const dynamic = "force-dynamic";

type MediaKind = "movie" | "tv";

type AvailabilityItem = {
  kind?: unknown;
  tmdb_id?: unknown;
  imdb_id?: unknown;
  id?: unknown;
};

function mediaKind(value: unknown): MediaKind | null {
  return value === "movie" || value === "tv" ? value : null;
}

function mediaId(item: AvailabilityItem) {
  const tmdbId = String(item.tmdb_id ?? "").trim();
  if (/^[1-9]\d*$/.test(tmdbId)) return tmdbId;
  const imdbId = String(item.imdb_id ?? "").trim();
  if (/^tt[1-9]\d{4,}$/i.test(imdbId)) return imdbId.toLowerCase();
  const fallback = String(item.id ?? "").trim().replace(/^(?:movie-|tv-)/i, "");
  if (/^[1-9]\d*$/.test(fallback)) return fallback;
  if (/^tt[1-9]\d{4,}$/i.test(fallback)) return fallback.toLowerCase();
  return "";
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

  let disabledIds: string[] = [];
  try {
    disabledIds = await listarServidoresDesabilitados();
  } catch {
    disabledIds = [...DEFAULT_DISABLED_PLAYER_SERVER_IDS];
  }
  const disabled = new Set(disabledIds);
  const enabledByKind = {
    movie: PLAYER_SERVERS.filter((server) => server.supportsMovie && !disabled.has(server.id)).length,
    tv: PLAYER_SERVERS.filter((server) => server.supportsTv && !disabled.has(server.id)).length,
  };

  const validKeys: string[] = [];
  let rejected = 0;
  items.forEach((item) => {
    const kind = mediaKind(item.kind);
    const id = mediaId(item);
    if (!kind || !id || enabledByKind[kind] === 0) {
      rejected += 1;
      return;
    }
    validKeys.push(`${kind}:${id}`);
  });
  const available = [...new Set(validKeys)];

  return Response.json({
    available: [...new Set(available)],
    validation: {
      received: items.length,
      valid: available.length,
      rejected,
      duplicates: Math.max(0, validKeys.length - available.length),
      enabled_servers: enabledByKind,
    },
  });
}
