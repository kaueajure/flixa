import { requireUsuario } from "../../../../db/auth";
import { WATCH_PARTY_ENABLED } from "../../../../lib/feature-flags";
import { createAblyTokenRequest, signSession, verifySession, newSession } from "../../../../lib/watch-party-auth";

export const dynamic = "force-dynamic";

function ablyKey() { return (process.env.ABLY_API_KEY || "").trim(); }
function signingSecret() { return (process.env.WATCH_PARTY_SECRET || ablyKey()).trim(); }

export async function POST(request: Request) {
  if (!WATCH_PARTY_ENABLED) {
    return Response.json(
      { erro: "O Assistir Junto está temporariamente desabilitado." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (!ablyKey() || !signingSecret()) {
    return Response.json({ erro: "Assistir em grupo não está configurado: o administrador precisa definir ABLY_API_KEY no servidor.", code: "not_configured" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  const usuario = await requireUsuario(request);
  if (!usuario) return Response.json({ erro: "Não autenticado." }, { status: 401 });

  let body: { action?: string; roomCode?: string; session?: string } = {};
  try {
    body = await request.json();
  } catch {
    return Response.json({ erro: "Requisição inválida." }, { status: 400 });
  }
  if (!body || typeof body !== "object" || !["create", "join", "refresh"].includes(String(body.action))) return Response.json({ erro: "Ação inválida." }, { status: 400 });

  let claims = body.action === "refresh" ? verifySession(body.session, signingSecret()) : null;
  if (claims && claims.uid !== usuario.id) claims = null;
  if (!claims && body.action === "refresh") {
    return Response.json({ erro: "A autorização da sala expirou." }, { status: 401 });
  }

  if (!claims) {
    const role = body.action === "create" ? "host" : "guest";
    claims = newSession(usuario.id, usuario.username ? `@${usuario.username}` : usuario.nome, role, body.roomCode);
    if (!claims) return Response.json({ erro: "Código de sala inválido." }, { status: 400 });
  }

  try {
    const tokenRequest = createAblyTokenRequest(claims.clientId, claims.roomCode, claims.role, ablyKey());
    return Response.json({
      tokenRequest,
      session: signSession(claims, signingSecret()),
      roomCode: claims.roomCode,
      role: claims.role,
      clientId: claims.clientId,
      name: claims.name,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[watch-party] Falha ao emitir token Ably:", error);
    return Response.json({ erro: "A conexão em tempo real não pôde ser autorizada." }, { status: 502 });
  }
}
