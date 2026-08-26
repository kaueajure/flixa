import {
  cadastrarUsuario,
  criarSessao,
  montarCookieSessao,
  paraUsuarioPublico,
} from "../../../../db/auth";
import { checkRateLimit, rateLimitResponse } from "../../../../lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const limit = checkRateLimit(request, "auth-register", 5, 60 * 60 * 1000);
  if (!limit.allowed) {
    return rateLimitResponse(limit.retryAfterSeconds, "Muitos cadastros a partir deste endereço. Tente novamente mais tarde.");
  }

  try {
    const body = (await request.json()) as { nome?: string; username?: string; email?: string; senha?: string };
    const nome = String(body.nome || "");
    const username = String(body.username || "");
    const email = String(body.email || "");
    const senha = String(body.senha || "");

    const resultado = await cadastrarUsuario({ nome, username, email, senha });
    if (!resultado.usuario) {
      return Response.json({ erro: resultado.erro || "Não foi possível cadastrar." }, { status: 400 });
    }

    const token = await criarSessao(resultado.usuario.id);
    return Response.json(
      { usuario: paraUsuarioPublico(resultado.usuario) },
      {
        status: 201,
        headers: {
          "Set-Cookie": montarCookieSessao(token, undefined, request),
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    console.error("[auth-register] Falha no cadastro:", error);
    return Response.json({ erro: "Não foi possível cadastrar agora." }, { status: 500 });
  }
}
