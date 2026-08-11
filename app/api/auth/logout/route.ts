import { encerrarSessao, lerTokenCookie, montarCookieLogout } from "../../../../db/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const token = lerTokenCookie(request.headers.get("cookie"));
    await encerrarSessao(token);
    return Response.json(
      { ok: true },
      {
        status: 200,
        headers: {
          "Set-Cookie": montarCookieLogout(request),
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao sair";
    return Response.json({ erro: message }, { status: 500 });
  }
}
