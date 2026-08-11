import {
  atualizarUsuarioAdmin,
  excluirUsuarioAdmin,
  listarUsuariosAdmin,
  paraUsuarioPublico,
  requireAdmin,
} from "../../../../db/auth";
import { estatisticasAdmin } from "../../../../db/library";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) {
      return Response.json({ erro: "Acesso restrito a administradores." }, { status: 403 });
    }
    const [usuarios, estatisticas] = await Promise.all([listarUsuariosAdmin(), estatisticasAdmin()]);
    return Response.json(
      { usuarios, estatisticas, eu: paraUsuarioPublico(admin) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao carregar painel";
    return Response.json({ erro: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) {
      return Response.json({ erro: "Acesso restrito a administradores." }, { status: 403 });
    }
    const body = (await request.json()) as {
      id?: number;
      administrador?: boolean;
      nome?: string;
    };
    const id = Number(body.id);
    if (!Number.isFinite(id) || id <= 0) {
      return Response.json({ erro: "Informe o id do usuário." }, { status: 400 });
    }
    const resultado = await atualizarUsuarioAdmin(
      id,
      { administrador: body.administrador, nome: body.nome },
      admin.id,
    );
    if (!resultado.usuario) {
      return Response.json({ erro: resultado.erro || "Não foi possível atualizar." }, { status: 400 });
    }
    return Response.json(
      { usuario: paraUsuarioPublico(resultado.usuario) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao atualizar usuário";
    return Response.json({ erro: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) {
      return Response.json({ erro: "Acesso restrito a administradores." }, { status: 403 });
    }
    const { searchParams } = new URL(request.url);
    let id = Number(searchParams.get("id") || "");
    if (!Number.isFinite(id) || id <= 0) {
      const body = (await request.json().catch(() => null)) as { id?: number } | null;
      id = Number(body?.id || "");
    }
    if (!Number.isFinite(id) || id <= 0) {
      return Response.json({ erro: "Informe o id do usuário." }, { status: 400 });
    }
    const resultado = await excluirUsuarioAdmin(id, admin.id);
    if (resultado.erro) {
      return Response.json({ erro: resultado.erro }, { status: 400 });
    }
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao excluir usuário";
    return Response.json({ erro: message }, { status: 500 });
  }
}
