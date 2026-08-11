import { lookup } from "node:dns/promises";
import { createPool, type Pool } from "mysql2/promise";
import { drizzle, type MySql2Database } from "drizzle-orm/mysql2";
import * as schema from "./schema";

export type FlixaDb = MySql2Database<typeof schema>;

let pool: Pool | null = null;
let db: FlixaDb | null = null;
let poolPromise: Promise<Pool> | null = null;

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Variável de ambiente ausente: ${name}`);
  }
  return value;
}

/** Hostinger publica AAAA; forçamos IPv4 para evitar ETIMEDOUT no Windows/Node. */
async function resolveMysqlHost(host: string) {
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) return host;
  const { address } = await lookup(host, { family: 4 });
  return address;
}

export async function getMysqlPool() {
  if (pool) return pool;
  if (poolPromise) return poolPromise;

  poolPromise = (async () => {
    const host = await resolveMysqlHost(requiredEnv("MYSQL_HOST"));
    pool = createPool({
      host,
      port: Number(process.env.MYSQL_PORT || "3306"),
      user: requiredEnv("MYSQL_USER"),
      password: requiredEnv("MYSQL_PASSWORD"),
      database: requiredEnv("MYSQL_DATABASE"),
      waitForConnections: true,
      connectionLimit: 5,
      enableKeepAlive: true,
      timezone: "Z",
      dateStrings: true,
      connectTimeout: 20000,
    });
    return pool;
  })();

  try {
    return await poolPromise;
  } catch (error) {
    poolPromise = null;
    pool = null;
    throw error;
  }
}

export async function getDb() {
  if (db) return db;
  await getMysqlPool();
  db = drizzle(pool!, { schema, mode: "default" });
  return db;
}

export async function closeDb() {
  if (pool) {
    await pool.end();
  }
  pool = null;
  db = null;
  poolPromise = null;
}
