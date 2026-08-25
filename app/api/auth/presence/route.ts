import {
  encerrarPresenca,
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
    const body = await request.json().catch(() => null) as {
      clientId?: string;
      area?: string;
      state?: "online" | "offline";
    } | null;
    const clientId = String(body?.clientId || "").trim();
    if (!/^[a-zA-Z0-9_-]{12,64}$/.test(clientId)) {
      return Response.json({ erro: "Identificador de presença inválido.", ok: false }, { status: 400 });
    }
    const allowedAreas = new Set(["app", "admin", "settings"]);
    const area = allowedAreas.has(String(body?.area)) ? String(body?.area) : "app";
    if (body?.state === "offline") {
      await encerrarPresenca(usuario.id, clientId);
    } else {
      await registrarPresenca(usuario.id, token, clientId, area);
    }
    return Response.json(
      { ok: true, state: body?.state === "offline" ? "offline" : "online" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao atualizar presença";
    return Response.json({ erro: message, ok: false }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
