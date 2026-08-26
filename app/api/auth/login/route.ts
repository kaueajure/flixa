import {
  autenticarUsuario,
  criarSessao,
  montarCookieSessao,
  paraUsuarioPublico,
} from "../../../../db/auth";
import { checkRateLimit, rateLimitResponse } from "../../../../lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const limit = checkRateLimit(request, "auth-login", 10, 15 * 60 * 1000);
  if (!limit.allowed) {
    return rateLimitResponse(limit.retryAfterSeconds);
  }

  try {
    const body = (await request.json()) as { email?: string; senha?: string };
    const email = String(body.email || "").trim().toLowerCase();
    const senha = String(body.senha || "");

    if (!email || !senha) {
      return Response.json({ erro: "Informe e-mail e senha." }, { status: 400 });
    }

    const usuario = await autenticarUsuario(email, senha);
    if (!usuario) {
      return Response.json({ erro: "E-mail ou senha inválidos." }, { status: 401 });
    }

    const token = await criarSessao(usuario.id);
    return Response.json(
      { usuario: paraUsuarioPublico(usuario) },
      {
        status: 200,
        headers: {
          "Set-Cookie": montarCookieSessao(token, undefined, request),
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    console.error("[auth-login] Falha no login:", error);
    return Response.json({ erro: "Não foi possível entrar agora." }, { status: 500 });
  }
}
