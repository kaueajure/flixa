import { requireUsuario } from "../../../../db/auth";
import { miniFailure, miniId, miniService, sourceId } from "../../../../lib/miniseries/server";
import { MiniError } from "../../../../lib/miniseries/types";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    if (request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin) throw new MiniError("Origem inválida.", 403);
    const body = await request.json();
    const id = miniId(body.id); const source = sourceId(body.source);
    if (typeof body.episode !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(body.episode)) throw new MiniError("Episódio inválido.", 400);
    const user = await requireUsuario(request);
    if (!user) throw new MiniError("Entre para iniciar um episódio.", 401);
    return Response.json(await miniService().play(id, source, body.episode, user.id), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return miniFailure(error); }
}
