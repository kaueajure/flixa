import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { Rest, type CapabilityOp } from "ably";
import { requireUsuario } from "../../../../db/auth";

export const dynamic = "force-dynamic";

const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const SESSION_TTL = 12 * 60 * 60_000;
const TOKEN_TTL = 60 * 60_000;

type PartyRole = "host" | "guest";

type SessionClaims = {
  uid: number;
  name: string;
  roomCode: string;
  role: PartyRole;
  clientId: string;
  exp: number;
};

function ablyKey() {
  return (process.env.ABLY_API_KEY || "").trim();
}

function signingSecret() {
  return (process.env.WATCH_PARTY_SECRET || process.env.MYSQL_PASSWORD || ablyKey()).trim();
}

function normalizeRoomCode(value: unknown) {
  return String(value || "").toUpperCase().replace(/[^A-Z2-9]/g, "").slice(0, 6);
}

function makeRoomCode() {
  const bytes = randomBytes(6);
  let code = "";
  for (let index = 0; index < 6; index += 1) {
    code += ROOM_ALPHABET[bytes[index] % ROOM_ALPHABET.length];
  }
  return code;
}

function signSession(claims: SessionClaims) {
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const signature = createHmac("sha256", signingSecret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function verifySession(value: unknown): SessionClaims | null {
  const [payload, signature, extra] = String(value || "").split(".");
  if (!payload || !signature || extra || !signingSecret()) return null;
  const expected = createHmac("sha256", signingSecret()).update(payload).digest();
  let received: Buffer;
  try {
    received = Buffer.from(signature, "base64url");
  } catch {
    return null;
  }
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as SessionClaims;
    if (
      !Number.isInteger(claims.uid) ||
      typeof claims.name !== "string" ||
      normalizeRoomCode(claims.roomCode).length !== 6 ||
      (claims.role !== "host" && claims.role !== "guest") ||
      typeof claims.clientId !== "string" ||
      !Number.isFinite(claims.exp) ||
      claims.exp <= Date.now()
    ) return null;
    return claims;
  } catch {
    return null;
  }
}

function newSession(uid: number, name: string, role: PartyRole, requestedCode: unknown): SessionClaims | null {
  const roomCode = role === "host" ? makeRoomCode() : normalizeRoomCode(requestedCode);
  if (roomCode.length !== 6) return null;
  return {
    uid,
    name: name.slice(0, 80),
    roomCode,
    role,
    clientId: `${role}:${uid}:${randomBytes(8).toString("hex")}`,
    exp: Date.now() + SESSION_TTL,
  };
}

export async function POST(request: Request) {
  const usuario = await requireUsuario(request);
  if (!usuario) return Response.json({ erro: "Não autenticado." }, { status: 401 });
  if (!ablyKey() || !signingSecret()) {
    return Response.json({ erro: "Ably não está configurado no servidor." }, { status: 503 });
  }

  let body: { action?: string; roomCode?: string; session?: string } = {};
  try {
    body = await request.json();
  } catch {
    // O primeiro acesso pode não ter corpo em clientes antigos.
  }

  let claims = body.action === "refresh" ? verifySession(body.session) : null;
  if (claims && claims.uid !== usuario.id) claims = null;
  if (!claims && body.action === "refresh") {
    return Response.json({ erro: "A autorização da sala expirou." }, { status: 401 });
  }

  if (!claims) {
    const role: PartyRole = body.action === "create" ? "host" : "guest";
    claims = newSession(usuario.id, usuario.nome, role, body.roomCode);
    if (!claims) return Response.json({ erro: "Código de sala inválido." }, { status: 400 });
  }

  const resource = `watch-party:${claims.roomCode}`;
  const operations: CapabilityOp[] = claims.role === "host"
    ? ["publish", "subscribe", "presence", "history"]
    : ["subscribe", "presence", "history"];

  try {
    const client = new Rest({ key: ablyKey() });
    const tokenRequest = await client.auth.createTokenRequest({
      clientId: claims.clientId,
      capability: { [resource]: operations },
      ttl: TOKEN_TTL,
    });
    return Response.json({
      tokenRequest,
      session: signSession(claims),
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
