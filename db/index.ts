import { createConnection, createPool, type ConnectionOptions, type Pool } from "mysql2/promise";
import { drizzle, type MySql2Database } from "drizzle-orm/mysql2";
import * as schema from "./schema";

export type FlixaDb = MySql2Database<typeof schema>;

let nodePool: Pool | null = null;
let nodeDb: FlixaDb | null = null;

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Variável de ambiente ausente: ${name}`);
  }
  return value;
}

function mysqlConnectionOptions(): ConnectionOptions {
  return {
    host: requiredEnv("MYSQL_HOST"),
    port: Number(process.env.MYSQL_PORT || "3306"),
    user: requiredEnv("MYSQL_USER"),
    password: requiredEnv("MYSQL_PASSWORD"),
    database: requiredEnv("MYSQL_DATABASE"),
    // O runtime RSC do Vinext bloqueia `eval`/`new Function`. Sem isto, o
    // mysql2 pode falhar ao compilar o parser de uma nova forma de consulta.
    disableEval: true,
    enableKeepAlive: true,
    timezone: "Z",
    dateStrings: true,
    // Na Hostinger, use MYSQL_HOST=localhost (não o hostname público srv….hstgr.io).
    connectTimeout: Number(process.env.MYSQL_CONNECT_TIMEOUT_MS || "8000"),
  };
}

function isWorkerRuntime() {
  return "WebSocketPair" in globalThis;
}

function getNodeDb() {
  if (nodeDb) return nodeDb;
  nodePool = createPool({
    ...mysqlConnectionOptions(),
    waitForConnections: true,
    connectionLimit: 5,
    maxIdle: 2,
    idleTimeout: 10_000,
  });
  nodeDb = drizzle(nodePool, { schema, mode: "default" });
  return nodeDb;
}

/**
 * Mantém conexão, callbacks e Promises dentro da mesma requisição. O workerd
 * usado pelo Vinext cancela continuações vinculadas a um request anterior, por
 * isso conexões MySQL não podem ficar em estado global entre chamadas da API.
 */
export async function withDb<T>(operation: (db: FlixaDb) => Promise<T>): Promise<T> {
  if (!isWorkerRuntime()) {
    return operation(getNodeDb());
  }

  const connection = await createConnection(mysqlConnectionOptions());
  try {
    const db = drizzle(connection, { schema, mode: "default" });
    return await operation(db);
  } finally {
    await connection.end().catch(() => {
      console.warn("[database] A conexão terminou antes da finalização explícita.");
    });
  }
}
