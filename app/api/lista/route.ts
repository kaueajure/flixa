import { requireUsuario } from "../../../db/auth";
import { adicionarNaLista, chaveTitulo, listarMinhaLista, removerDaLista, type TituloPayload } from "../../../db/library";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const usuario = await requireUsuario(request);
    if (!usuario) {
      return Response.json({ erro: "Não autenticado.", itens: [] }, { status: 401 });
    }
    const itens = await listarMinhaLista(usuario.id);
    return Response.json({ itens }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao carregar lista";
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
    const chave = await adicionarNaLista(usuario.id, movie);
    return Response.json({ ok: true, chave }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao salvar na lista";
    return Response.json({ erro: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const usuario = await requireUsuario(request);
    if (!usuario) {
      return Response.json({ erro: "Não autenticado." }, { status: 401 });
    }
    const { searchParams } = new URL(request.url);
    let chave = searchParams.get("chave")?.trim() || "";
    if (!chave) {
      const body = (await request.json().catch(() => null)) as { chave?: string; movie?: TituloPayload } | null;
      chave = body?.chave?.trim() || (body?.movie ? chaveTitulo(body.movie) : "");
    }
    if (!chave) {
      return Response.json({ erro: "Informe a chave do título." }, { status: 400 });
    }
    await removerDaLista(usuario.id, chave);
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao remover da lista";
    return Response.json({ erro: message }, { status: 500 });
  }
}
