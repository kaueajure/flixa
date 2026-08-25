import {
  alterarSenha,
  atualizarAvatar,
  atualizarPerfil,
  lerTokenCookie,
  paraUsuarioPublico,
  requireUsuario,
} from "../../../../db/auth";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request) {
  try {
    const usuario = await requireUsuario(request);
    if (!usuario) return Response.json({ erro: "Não autenticado." }, { status: 401 });
    const body = await request.json() as {
      action?: string;
      nome?: string;
      email?: string;
      senhaAtual?: string;
      novaSenha?: string;
      confirmarSenha?: string;
      avatarId?: string | null;
    };

    if (body.action === "profile") {
      const result = await atualizarPerfil(usuario.id, {
        nome: String(body.nome || ""),
        email: String(body.email || ""),
        senhaAtual: String(body.senhaAtual || ""),
      });
      if (result.erro || !result.usuario) return Response.json({ erro: result.erro }, { status: 400 });
      return Response.json(
        { usuario: paraUsuarioPublico(result.usuario), mensagem: "Dados da conta atualizados." },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    if (body.action === "password") {
      const novaSenha = String(body.novaSenha || "");
      if (novaSenha !== String(body.confirmarSenha || "")) {
        return Response.json({ erro: "As novas senhas não coincidem." }, { status: 400 });
      }
      const tokenAtual = lerTokenCookie(request.headers.get("cookie"));
      const result = await alterarSenha(usuario.id, String(body.senhaAtual || ""), novaSenha, tokenAtual);
      if (result.erro) return Response.json({ erro: result.erro }, { status: 400 });
      return Response.json(
        { mensagem: "Senha alterada. As outras sessões foram encerradas." },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    if (body.action === "avatar") {
      const avatarId = body.avatarId === null ? null : String(body.avatarId || "");
      const result = await atualizarAvatar(usuario.id, avatarId);
      if (result.erro || !result.usuario) return Response.json({ erro: result.erro }, { status: 400 });
      return Response.json(
        { usuario: paraUsuarioPublico(result.usuario), mensagem: avatarId ? "Foto de perfil atualizada." : "Foto de perfil removida." },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    return Response.json({ erro: "Ação inválida." }, { status: 400 });
  } catch (error) {
    console.error("[conta] Falha ao atualizar conta:", error);
    return Response.json({ erro: "Não foi possível atualizar sua conta agora." }, { status: 500 });
  }
}
