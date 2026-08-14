import { requireAdmin } from "../../../../db/auth";
import {
  definirServidorHabilitado,
  listarServidoresAdmin,
  obterServidorAdmin,
  registrarTesteServidor,
} from "../../../../db/player-servers";
import { getPlayerServer, PLAYER_SERVERS } from "../../../../lib/player-servers";
import { testPlayerServer } from "../../../../lib/player-server-health";

export const dynamic = "force-dynamic";

function forbidden() {
  return Response.json({ erro: "Acesso restrito a administradores." }, { status: 403 });
}

export async function GET(request: Request) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) return forbidden();
    return Response.json(
      { servidores: await listarServidoresAdmin() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao carregar servidores";
    return Response.json({ erro: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) return forbidden();
    const body = (await request.json()) as { id?: string; enabled?: boolean; minutes?: number | null };
    const id = String(body.id || "").trim();
    if (!getPlayerServer(id) || typeof body.enabled !== "boolean") {
      return Response.json({ erro: "Servidor ou estado inválido." }, { status: 400 });
    }
    const minutes = body.minutes == null ? null : Number(body.minutes);
    await definirServidorHabilitado(id, body.enabled, admin.id, Number.isFinite(minutes) ? minutes : null);
    return Response.json(
      { servidor: await obterServidorAdmin(id) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao atualizar servidor";
    return Response.json({ erro: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) return forbidden();
    const body = (await request.json().catch(() => ({}))) as {
      action?: "test" | "confirm";
      id?: string;
      ids?: string[];
      ok?: boolean;
    };

    if (body.action === "confirm") {
      const id = String(body.id || "").trim();
      if (!getPlayerServer(id) || typeof body.ok !== "boolean") {
        return Response.json({ erro: "Confirmação inválida." }, { status: 400 });
      }
      await registrarTesteServidor(
        id,
        {
          status: body.ok ? "online" : "offline",
          message: body.ok ? "Reprodução confirmada manualmente pelo admin" : "Falha confirmada manualmente pelo admin",
        },
        admin.id,
      );
      return Response.json(
        { servidor: await obterServidorAdmin(id) },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    const requestedId = String(body.id || "").trim();
    const requestedIds = Array.isArray(body.ids)
      ? [...new Set(body.ids.map((id) => String(id).trim()))].slice(0, 8)
      : [];
    const targets = requestedId
      ? [getPlayerServer(requestedId)].filter(Boolean)
      : requestedIds.length
        ? requestedIds.map((id) => getPlayerServer(id)).filter(Boolean)
        : PLAYER_SERVERS;
    if (targets.length === 0) {
      return Response.json({ erro: "Servidor não encontrado." }, { status: 404 });
    }

    const results = await Promise.all(targets.map((server) => testPlayerServer(server!)));
    await Promise.all(
      results.map((result) =>
        registrarTesteServidor(
          result.id,
          {
            status: result.status,
            httpStatus: result.httpStatus,
            latencyMs: result.latencyMs,
            message: result.message,
          },
          admin.id,
        ),
      ),
    );
    const all = await listarServidoresAdmin();
    return Response.json(
      {
        servidores: requestedId
          ? all.filter((server) => server.id === requestedId)
          : requestedIds.length
            ? all.filter((server) => requestedIds.includes(server.id))
            : all,
        resultados: results,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao testar servidores";
    return Response.json({ erro: message }, { status: 500 });
  }
}
