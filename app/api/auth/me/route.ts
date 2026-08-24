import { lerTokenCookie, obterUsuarioPorToken, paraUsuarioPublico, requireUsuario } from "../../../../db/auth";
import { definirUsername } from "../../../../db/social";

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

export async function PATCH(request: Request) {
  try {
    const usuario = await requireUsuario(request);
    if (!usuario) return Response.json({ erro: "Não autenticado." }, { status: 401 });
    const body = await request.json() as { username?: string };
    const result = await definirUsername(usuario.id, String(body.username || ""));
    if (result.erro) return Response.json({ erro: result.erro }, { status: 400 });
    return Response.json({ usuario: { ...paraUsuarioPublico(usuario), username: result.username } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao definir username";
    return Response.json({ erro: message }, { status: 500 });
  }
}
