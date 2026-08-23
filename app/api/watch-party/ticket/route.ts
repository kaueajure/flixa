import { createHmac, randomBytes } from "node:crypto";
import { requireUsuario } from "../../../../db/auth";

export const dynamic = "force-dynamic";

function ticketSecret() {
  return (process.env.WATCH_PARTY_SECRET || process.env.MYSQL_PASSWORD || "").trim();
}

export async function POST(request: Request) {
  const usuario = await requireUsuario(request);
  if (!usuario) return Response.json({ erro: "Não autenticado." }, { status: 401 });
  const secret = ticketSecret();
  if (!secret) return Response.json({ erro: "Servidor de sessão não configurado." }, { status: 503 });
  const payload = Buffer.from(JSON.stringify({
    uid: usuario.id,
    name: usuario.nome,
    exp: Date.now() + 5 * 60_000,
    nonce: randomBytes(12).toString("hex"),
  })).toString("base64url");
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return Response.json(
    { ticket: `${payload}.${signature}` },
    { headers: { "Cache-Control": "no-store" } },
  );
}
