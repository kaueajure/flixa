import {
  cadastrarUsuario,
  criarSessao,
  montarCookieSessao,
  paraUsuarioPublico,
} from "../../../../db/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { nome?: string; email?: string; senha?: string };
    const nome = String(body.nome || "");
    const email = String(body.email || "");
    const senha = String(body.senha || "");

    const resultado = await cadastrarUsuario({ nome, email, senha });
    if (!resultado.usuario) {
      return Response.json({ erro: resultado.erro || "Não foi possível cadastrar." }, { status: 400 });
    }

    const token = await criarSessao(resultado.usuario.id);
    return Response.json(
      { usuario: paraUsuarioPublico(resultado.usuario) },
      {
        status: 201,
        headers: {
          "Set-Cookie": montarCookieSessao(token),
        },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha no cadastro";
    return Response.json({ erro: message }, { status: 500 });
  }
}
