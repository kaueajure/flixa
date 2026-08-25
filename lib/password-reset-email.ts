type ResetRecipient = { nome: string; email: string };

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[character] || character);
}

export function criarUrlRecuperacao(request: Request, token: string) {
  const configured = process.env.FLIXA_PUBLIC_URL?.trim().replace(/\/$/, "");
  if (configured) {
    const base = new URL(configured);
    if (base.protocol !== "https:" && base.hostname !== "localhost" && base.hostname !== "127.0.0.1") {
      throw new Error("FLIXA_PUBLIC_URL precisa usar HTTPS.");
    }
    return `${base.origin}/login?reset=${encodeURIComponent(token)}`;
  }

  const requestUrl = new URL(request.url);
  if (process.env.NODE_ENV !== "production" && ["localhost", "127.0.0.1"].includes(requestUrl.hostname)) {
    return `${requestUrl.origin}/login?reset=${encodeURIComponent(token)}`;
  }
  throw new Error("Configure FLIXA_PUBLIC_URL para enviar links de recuperação.");
}

export async function enviarEmailRecuperacao(destinatario: ResetRecipient, resetUrl: string) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.PASSWORD_RESET_FROM_EMAIL?.trim();
  if (!apiKey || !from) {
    if (process.env.NODE_ENV !== "production") return false;
    throw new Error("Configure RESEND_API_KEY e PASSWORD_RESET_FROM_EMAIL.");
  }

  const nome = escapeHtml(destinatario.nome);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "User-Agent": "Flixa password recovery",
    },
    body: JSON.stringify({
      from,
      to: [destinatario.email],
      subject: "Redefina sua senha do Flixa",
      html: `<div style="font-family:Arial,sans-serif;color:#171717;line-height:1.6"><h2>Olá, ${nome}.</h2><p>Recebemos um pedido para redefinir sua senha do Flixa.</p><p><a href="${escapeHtml(resetUrl)}" style="display:inline-block;background:#e50914;color:#fff;padding:12px 18px;border-radius:999px;text-decoration:none;font-weight:700">Criar nova senha</a></p><p>Este link expira em 30 minutos e funciona uma única vez. Se você não fez o pedido, ignore este e-mail.</p></div>`,
      text: `Olá, ${destinatario.nome}. Redefina sua senha do Flixa em: ${resetUrl}\n\nO link expira em 30 minutos e funciona uma única vez.`,
    }),
  });
  if (!response.ok) throw new Error(`O serviço de e-mail respondeu com status ${response.status}.`);
  return true;
}
