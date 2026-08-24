import { requireUsuario } from "../../../db/auth";
import {
  buscarUsuarios,
  enviarSolicitacao,
  listarSocial,
  removerRelacao,
  responderSolicitacao,
} from "../../../db/social";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const usuario = await requireUsuario(request);
    if (!usuario) return Response.json({ erro: "Não autenticado." }, { status: 401 });
    const query = new URL(request.url).searchParams.get("q") || "";
    if (query.trim()) {
      return Response.json({ resultados: await buscarUsuarios(usuario.id, query) }, { headers: { "Cache-Control": "no-store" } });
    }
    return Response.json(await listarSocial(usuario.id), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao carregar amizades";
    return Response.json({ erro: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const usuario = await requireUsuario(request);
    if (!usuario) return Response.json({ erro: "Não autenticado." }, { status: 401 });
    const body = await request.json() as { action?: string; username?: string; userId?: number };
    const action = String(body.action || "");
    let result: { erro: string | null };
    if (action === "request") {
      result = await enviarSolicitacao(usuario.id, String(body.username || ""));
    } else if (action === "accept" || action === "reject") {
      const targetId = Number(body.userId);
      if (!Number.isInteger(targetId) || targetId < 1) return Response.json({ erro: "Usuário inválido." }, { status: 400 });
      result = await responderSolicitacao(usuario.id, targetId, action === "accept");
    } else if (action === "remove" || action === "cancel") {
      const targetId = Number(body.userId);
      if (!Number.isInteger(targetId) || targetId < 1) return Response.json({ erro: "Usuário inválido." }, { status: 400 });
      result = await removerRelacao(usuario.id, targetId);
    } else {
      return Response.json({ erro: "Ação inválida." }, { status: 400 });
    }
    if (result.erro) return Response.json({ erro: result.erro }, { status: 400 });
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao atualizar amizade";
    return Response.json({ erro: message }, { status: 500 });
  }
}
