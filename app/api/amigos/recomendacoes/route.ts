import { requireUsuario } from "../../../../db/auth";
import { enviarRecomendacao, listarRecomendacoes } from "../../../../db/social";
import { getTmdbDetails } from "../../movies/route";

export const dynamic = "force-dynamic";

function friendIdFrom(value: unknown) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function GET(request: Request) {
  try {
    const usuario = await requireUsuario(request);
    if (!usuario) return Response.json({ erro: "Não autenticado." }, { status: 401 });
    const friendId = friendIdFrom(new URL(request.url).searchParams.get("friendId"));
    if (!friendId) return Response.json({ erro: "Amigo inválido." }, { status: 400 });
    const result = await listarRecomendacoes(usuario.id, friendId);
    if (result.erro) return Response.json({ erro: result.erro }, { status: 403 });
    return Response.json(
      { recomendacoes: result.recomendacoes },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[recomendacoes] Falha ao listar:", error);
    return Response.json({ erro: "Não foi possível carregar os títulos enviados." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const usuario = await requireUsuario(request);
    if (!usuario) return Response.json({ erro: "Não autenticado." }, { status: 401 });
    const body = await request.json() as { friendId?: number; movie?: { tmdb_id?: string; kind?: string } };
    const friendId = friendIdFrom(body.friendId);
    if (!friendId) return Response.json({ erro: "Amigo inválido." }, { status: 400 });
    const tmdbId = String(body.movie?.tmdb_id || "").trim();
    const kind = body.movie?.kind === "tv" ? "tv" : body.movie?.kind === "movie" ? "movie" : null;
    if (!/^\d{1,12}$/.test(tmdbId) || !kind) return Response.json({ erro: "Título inválido." }, { status: 400 });
    const details = await getTmdbDetails(tmdbId, kind);
    if (!details.movie?.tmdb_id) return Response.json({ erro: "Não encontramos este título no catálogo." }, { status: 400 });
    const result = await enviarRecomendacao(usuario.id, friendId, details.movie);
    if (result.erro) return Response.json({ erro: result.erro }, { status: 400 });
    return Response.json(
      { ok: true, mensagem: "Título enviado." },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[recomendacoes] Falha ao enviar:", error);
    return Response.json({ erro: "Não foi possível enviar este título agora." }, { status: 500 });
  }
}
