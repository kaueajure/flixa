import {
  lerTokenCookie,
  obterUsuarioPorToken,
  registrarPresenca,
} from "../../../../db/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const token = lerTokenCookie(request.headers.get("cookie"));
    const usuario = await obterUsuarioPorToken(token);
    if (!usuario) {
      return Response.json({ ok: false }, { status: 401, headers: { "Cache-Control": "no-store" } });
    }
    await registrarPresenca(token);
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao atualizar presença";
    return Response.json({ erro: message, ok: false }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
