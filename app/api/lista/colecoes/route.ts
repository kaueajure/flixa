import { requireUsuario } from "../../../../db/auth";
import { criarColecao, definirColecoesTitulo, excluirColecao, listarColecoes } from "../../../../db/library";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const usuario = await requireUsuario(request);
  if (!usuario) return Response.json({ erro: "Não autenticado." }, { status: 401 });
  return Response.json({ colecoes: await listarColecoes(usuario.id) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const usuario = await requireUsuario(request);
  if (!usuario) return Response.json({ erro: "Não autenticado." }, { status: 401 });
  try {
    const body = await request.json() as { nome?: string };
    const result = await criarColecao(usuario.id, String(body.nome || ""));
    if (result.erro) return Response.json({ erro: result.erro }, { status: 400 });
    return Response.json({ colecao: result.colecao }, { status: 201 });
  } catch {
    return Response.json({ erro: "Essa coleção já existe ou não pôde ser criada." }, { status: 400 });
  }
}

export async function PUT(request: Request) {
  const usuario = await requireUsuario(request);
  if (!usuario) return Response.json({ erro: "Não autenticado." }, { status: 401 });
  const body = await request.json() as { chave?: string; collectionIds?: number[] };
  const ok = await definirColecoesTitulo(usuario.id, String(body.chave || "").slice(0, 64), Array.isArray(body.collectionIds) ? body.collectionIds : []);
  return ok ? Response.json({ ok: true }) : Response.json({ erro: "Título não encontrado." }, { status: 404 });
}

export async function DELETE(request: Request) {
  const usuario = await requireUsuario(request);
  if (!usuario) return Response.json({ erro: "Não autenticado." }, { status: 401 });
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id < 1) return Response.json({ erro: "Coleção inválida." }, { status: 400 });
  await excluirColecao(usuario.id, id);
  return Response.json({ ok: true });
}
