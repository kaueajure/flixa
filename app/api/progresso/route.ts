import { requireUsuario } from "../../../db/auth";
import {
  chaveTitulo,
  listarProgresso,
  obterProgresso,
  salvarProgresso,
  type TituloPayload,
} from "../../../db/library";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const usuario = await requireUsuario(request);
    if (!usuario) {
      return Response.json({ erro: "Não autenticado.", itens: [] }, { status: 401 });
    }
    const { searchParams } = new URL(request.url);
    const chave = searchParams.get("chave")?.trim() || "";
    if (chave) {
      const item = await obterProgresso(usuario.id, chave);
      return Response.json({ item }, { headers: { "Cache-Control": "no-store" } });
    }
    const itens = await listarProgresso(usuario.id);
    return Response.json({ itens }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao carregar progresso";
    return Response.json({ erro: message, itens: [] }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const usuario = await requireUsuario(request);
    if (!usuario) {
      return Response.json({ erro: "Não autenticado." }, { status: 401 });
    }
    const body = (await request.json()) as {
      movie?: TituloPayload;
      progresso?: number;
      posicao_segundos?: number;
      temporada?: number | null;
      episodio?: number | null;
    };
    const movie = body.movie;
    if (!movie?.id || !movie?.title) {
      return Response.json({ erro: "Informe o título." }, { status: 400 });
    }
    const item = await salvarProgresso(usuario.id, movie, {
      progresso: body.progresso,
      posicao_segundos: body.posicao_segundos,
      temporada: body.temporada,
      episodio: body.episodio,
    });
    return Response.json(
      { ok: true, chave: chaveTitulo(movie), item },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao salvar progresso";
    return Response.json({ erro: message }, { status: 500 });
  }
}
