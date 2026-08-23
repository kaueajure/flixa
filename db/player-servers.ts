import { asc } from "drizzle-orm";
import {
  PLAYER_SERVERS,
  getPlayerServer,
  type PlayerServerStatus,
} from "../lib/player-servers";
import type { PlayerServerHealthResult } from "../lib/player-server-health";
import { withDb, type FlixaDb } from "./index";
import { servidores_player } from "./schema";

function dateToSql(date = new Date()) {
  return date.toISOString().slice(0, 19).replace("T", " ");
}

function parseSqlDate(value: string | null) {
  if (!value) return null;
  const timestamp = Date.parse(`${value.replace(" ", "T")}Z`);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function effectiveEnabled(
  row: typeof servidores_player.$inferSelect | undefined,
  server?: (typeof PLAYER_SERVERS)[number],
) {
  if (!row) return server?.enabledByDefault === true;
  if (Number(row.habilitado) === 1) return true;
  const disabledUntil = parseSqlDate(row.desabilitado_ate);
  return disabledUntil != null && disabledUntil <= Date.now();
}

function parseDiagnostic(value: unknown): PlayerServerHealthResult | null {
  if (!value) return null;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as PlayerServerHealthResult;
    } catch {
      return null;
    }
  }
  return typeof value === "object" ? value as PlayerServerHealthResult : null;
}

function runDbOperation<T>(db: FlixaDb | undefined, operation: (activeDb: FlixaDb) => Promise<T>) {
  return db ? operation(db) : withDb(operation);
}

export async function listarServidoresAdmin(db?: FlixaDb) {
  const rows = await runDbOperation(db, (activeDb) =>
    activeDb.select().from(servidores_player).orderBy(asc(servidores_player.servidor_id)),
  );
  const byId = new Map(rows.map((row) => [row.servidor_id, row]));

  return PLAYER_SERVERS.map((server) => {
    const row = byId.get(server.id);
    return {
      ...server,
      enabled: effectiveEnabled(row, server),
      disabled_until: row?.desabilitado_ate ?? null,
      last_status: (row?.ultimo_status ?? "unknown") as PlayerServerStatus,
      last_http_status: row?.ultimo_http_status ?? null,
      last_latency_ms: row?.ultima_latencia_ms ?? null,
      last_message: row?.ultima_mensagem ?? null,
      last_diagnostic: parseDiagnostic(row?.ultimo_diagnostico),
      last_tested_at: row?.ultimo_teste_em ?? null,
    };
  });
}

export async function listarServidoresDesabilitados(db?: FlixaDb) {
  const rows = await runDbOperation(db, (activeDb) => activeDb.select().from(servidores_player));
  const byId = new Map(rows.map((row) => [row.servidor_id, row]));
  return PLAYER_SERVERS
    .filter((server) => !effectiveEnabled(byId.get(server.id), server))
    .map((server) => server.id);
}

export async function definirServidorHabilitado(
  serverId: string,
  enabled: boolean,
  adminId: number,
  minutes?: number | null,
  db?: FlixaDb,
) {
  const server = getPlayerServer(serverId);
  if (!server) throw new Error("Servidor desconhecido.");
  const now = new Date();
  const disabledUntil = !enabled && minutes && minutes > 0
    ? dateToSql(new Date(now.getTime() + Math.min(minutes, 30 * 24 * 60) * 60_000))
    : null;
  const values = {
    servidor_id: serverId,
    habilitado: enabled ? 1 : 0,
    desabilitado_ate: enabled ? null : disabledUntil,
    atualizado_por: adminId,
    atualizado_em: dateToSql(now),
  };
  await runDbOperation(db, async (activeDb) => {
    await activeDb
      .insert(servidores_player)
      .values(values)
      .onDuplicateKeyUpdate({
        set: {
          habilitado: values.habilitado,
          desabilitado_ate: values.desabilitado_ate,
          atualizado_por: adminId,
          atualizado_em: values.atualizado_em,
        },
      });
  });
}

export async function registrarTesteServidor(
  serverId: string,
  result: {
    status: PlayerServerStatus;
    httpStatus?: number | null;
    latencyMs?: number | null;
    message: string;
    diagnostic?: PlayerServerHealthResult | null;
  },
  adminId: number,
  db?: FlixaDb,
) {
  const server = getPlayerServer(serverId);
  if (!server) throw new Error("Servidor desconhecido.");
  const now = dateToSql();
  const values = {
    servidor_id: serverId,
    habilitado: server.enabledByDefault ? 1 : 0,
    ultimo_status: result.status,
    ultimo_http_status: result.httpStatus ?? null,
    ultima_latencia_ms: result.latencyMs ?? null,
    ultima_mensagem: result.message.slice(0, 500),
    ultimo_diagnostico: result.diagnostic ?? null,
    ultimo_teste_em: now,
    atualizado_por: adminId,
    atualizado_em: now,
  };
  await runDbOperation(db, async (activeDb) => {
    await activeDb
      .insert(servidores_player)
      .values(values)
      .onDuplicateKeyUpdate({
        set: {
          ultimo_status: values.ultimo_status,
          ultimo_http_status: values.ultimo_http_status,
          ultima_latencia_ms: values.ultima_latencia_ms,
          ultima_mensagem: values.ultima_mensagem,
          ultimo_diagnostico: values.ultimo_diagnostico,
          ultimo_teste_em: now,
          atualizado_por: adminId,
          atualizado_em: now,
        },
      });
  });
}

export async function obterServidorAdmin(serverId: string, db?: FlixaDb) {
  const list = await listarServidoresAdmin(db);
  return list.find((server) => server.id === serverId) ?? null;
}
