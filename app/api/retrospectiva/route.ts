import { requireUsuario } from "../../../db/auth";
import { obterRetrospectiva, registrarDescobertaRoleta } from "../../../db/retrospective";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const usuario = await requireUsuario(request);
  if (!usuario) return Response.json({ erro: "Não autenticado." }, { status: 401 });
  const mode = new URL(request.url).searchParams.get("mode") === "year" ? "year" : "month";
  return Response.json({ retrospectiva: await obterRetrospectiva(usuario.id, mode) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const usuario = await requireUsuario(request);
  if (!usuario) return Response.json({ erro: "Não autenticado." }, { status: 401 });
  const body = await request.json() as { key?: string; title?: string; poster?: string; genre?: string };
  if (!body.key || !body.title) return Response.json({ erro: "Título inválido." }, { status: 400 });
  await registrarDescobertaRoleta(usuario.id, { key: body.key, title: body.title, poster: body.poster, genre: body.genre });
  return Response.json({ ok: true }, { status: 201 });
}
