import { lerTokenCookie, obterUsuarioPorToken, paraUsuarioPublico } from "../../../../db/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const token = lerTokenCookie(request.headers.get("cookie"));
    const usuario = await obterUsuarioPorToken(token);
    if (!usuario) {
      return Response.json({ usuario: null }, { status: 401 });
    }
    return Response.json({ usuario: paraUsuarioPublico(usuario) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao validar sessão";
    return Response.json({ erro: message, usuario: null }, { status: 500 });
  }
}
