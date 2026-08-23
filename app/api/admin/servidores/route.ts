import { requireAdmin } from "../../../../db/auth";
import {
  definirServidorHabilitado,
  listarServidoresAdmin,
  obterServidorAdmin,
  registrarTesteServidor,
} from "../../../../db/player-servers";
import { getPlayerServer, PLAYER_SERVERS } from "../../../../lib/player-servers";
import { applyManualPlaybackConfirmation, testPlayerServer } from "../../../../lib/player-server-health";
import { withDb } from "../../../../db";

export const dynamic = "force-dynamic";

function forbidden() {
  return Response.json({ erro: "Acesso restrito a administradores." }, { status: 403 });
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  operation: (item: T) => Promise<R>,
) {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await operation(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
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
    const servidor = await withDb(async (db) => {
      await definirServidorHabilitado(id, body.enabled, admin.id, Number.isFinite(minutes) ? minutes : null, db);
      return obterServidorAdmin(id, db);
    });
    return Response.json(
      { servidor },
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
      kind?: "movie" | "tv";
    };

    if (body.action === "confirm") {
      const id = String(body.id || "").trim();
      const server = getPlayerServer(id);
      const kind = body.kind === "tv" ? "tv" : body.kind === "movie" ? "movie" : null;
      if (!server || !kind || typeof body.ok !== "boolean") {
        return Response.json({ erro: "Confirmação inválida." }, { status: 400 });
      }
      const current = await obterServidorAdmin(id);
      const baseline = current?.last_diagnostic ?? await testPlayerServer(server);
      const confirmed = applyManualPlaybackConfirmation(baseline, kind, body.ok);
      await registrarTesteServidor(
        id,
        {
          status: confirmed.status,
          httpStatus: confirmed.httpStatus,
          latencyMs: confirmed.latencyMs,
          message: confirmed.message,
          diagnostic: confirmed,
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

    // Cada provedor pode abrir filme e série ao mesmo tempo. Três provedores
    // mantêm no máximo seis verificações externas concorrentes por request.
    const results = await mapWithConcurrency(targets, 3, (server) => testPlayerServer(server!));
    const all = await withDb(async (db) => {
      for (const result of results) {
        await registrarTesteServidor(
          result.id,
          {
            status: result.status,
            httpStatus: result.httpStatus,
            latencyMs: result.latencyMs,
            message: result.message,
            diagnostic: result,
          },
          admin.id,
          db,
        );
      }
      return listarServidoresAdmin(db);
    });
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
