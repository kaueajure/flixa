import { criarRecuperacaoSenha, redefinirSenhaComToken } from "../../../../db/auth";
import { criarUrlRecuperacao, enviarEmailRecuperacao } from "../../../../lib/password-reset-email";

export const dynamic = "force-dynamic";
const GENERIC_MESSAGE = "Se esse e-mail estiver cadastrado, você receberá um link para criar uma nova senha.";

function waitUntil(startedAt: number, minimumMs = 400) {
  const remaining = minimumMs - (Date.now() - startedAt);
  return remaining > 0 ? new Promise((resolve) => setTimeout(resolve, remaining)) : Promise.resolve();
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  let devResetUrl: string | undefined;
  try {
    const body = await request.json() as { email?: string };
    const email = String(body.email || "");
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      const recuperacao = await criarRecuperacaoSenha(email);
      if (recuperacao) {
        const resetUrl = criarUrlRecuperacao(request, recuperacao.token);
        if (process.env.NODE_ENV !== "production") devResetUrl = resetUrl;
        try {
          await enviarEmailRecuperacao(recuperacao, resetUrl);
        } catch (error) {
          console.error("[recuperacao-senha] Falha ao enviar e-mail:", error);
        }
      }
    }
  } catch (error) {
    console.error("[recuperacao-senha] Falha ao criar solicitação:", error);
  }
  await waitUntil(startedAt);
  return Response.json(
    { mensagem: GENERIC_MESSAGE, ...(devResetUrl ? { devResetUrl } : {}) },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function PUT(request: Request) {
  try {
    const body = await request.json() as { token?: string; novaSenha?: string; confirmarSenha?: string };
    const novaSenha = String(body.novaSenha || "");
    if (novaSenha !== String(body.confirmarSenha || "")) {
      return Response.json({ erro: "As senhas não coincidem." }, { status: 400 });
    }
    const result = await redefinirSenhaComToken(String(body.token || ""), novaSenha);
    if (result.erro) return Response.json({ erro: result.erro }, { status: 400 });
    return Response.json(
      { mensagem: "Senha redefinida. Agora você já pode entrar." },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[recuperacao-senha] Falha ao redefinir senha:", error);
    return Response.json({ erro: "Não foi possível redefinir a senha agora." }, { status: 500 });
  }
}
