import { requireUsuario } from "../../../db/auth";
import { listarHistorico, registrarHistorico, type TituloPayload } from "../../../db/library";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const usuario = await requireUsuario(request);
    if (!usuario) {
      return Response.json({ erro: "Não autenticado.", itens: [] }, { status: 401 });
    }
    const itens = await listarHistorico(usuario.id);
    return Response.json({ itens }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao carregar histórico";
    return Response.json({ erro: message, itens: [] }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const usuario = await requireUsuario(request);
    if (!usuario) {
      return Response.json({ erro: "Não autenticado." }, { status: 401 });
    }
    const body = (await request.json()) as { movie?: TituloPayload };
    const movie = body.movie;
    if (!movie?.id || !movie?.title) {
      return Response.json({ erro: "Informe o título." }, { status: 400 });
    }
    const chave = await registrarHistorico(usuario.id, movie);
    return Response.json({ ok: true, chave }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao registrar histórico";
    return Response.json({ erro: message }, { status: 500 });
  }
}
