import { requireUsuario } from "../../../../db/auth";
import { miniFailure, miniId, miniService, sourceId } from "../../../../lib/miniseries/server";
import { MiniError } from "../../../../lib/miniseries/types";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const u = new URL(request.url); const id = miniId(u.searchParams.get("id")); const source = sourceId(u.searchParams.get("source"));
    if (!await requireUsuario(request)) throw new MiniError("Entre para consultar episódios.", 401);
    const episode = u.searchParams.get("episode");
    if (episode && !/^\d{1,32}$/.test(episode)) throw new MiniError("Identificador de episódio inválido.", 400);
    return Response.json(episode ? { episode: await miniService().episodeDetail(id, source, episode) } : { episodes: await miniService().episodes(id, source) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return miniFailure(error); }
}
