import {
  autenticarUsuario,
  criarSessao,
  montarCookieSessao,
  paraUsuarioPublico,
} from "../../../../db/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
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
          "Set-Cookie": montarCookieSessao(token),
        },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha no login";
    return Response.json({ erro: message }, { status: 500 });
  }
}
