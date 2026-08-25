import { requireUsuario } from "../../../../db/auth";
import { listarEpisodiosAssistidos, marcarEpisodioAssistido } from "../../../../db/library";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const usuario = await requireUsuario(request);
  if (!usuario) return Response.json({ erro: "Não autenticado." }, { status: 401 });
  const chave = String(new URL(request.url).searchParams.get("chave") || "").slice(0, 64);
  return Response.json({ episodios: chave ? await listarEpisodiosAssistidos(usuario.id, chave) : [] }, { headers: { "Cache-Control": "no-store" } });
}

export async function PUT(request: Request) {
  const usuario = await requireUsuario(request);
  if (!usuario) return Response.json({ erro: "Não autenticado." }, { status: 401 });
  const body = await request.json() as { chave?: string; season?: number; episode?: number; watched?: boolean };
  const chave = String(body.chave || "").slice(0, 64);
  const season = Math.floor(Number(body.season));
  const episode = Math.floor(Number(body.episode));
  if (!chave || season < 1 || episode < 1) return Response.json({ erro: "Episódio inválido." }, { status: 400 });
  await marcarEpisodioAssistido(usuario.id, chave, season, episode, body.watched !== false);
  return Response.json({ ok: true });
}
