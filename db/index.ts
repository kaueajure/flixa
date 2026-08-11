import { createPool, type Pool } from "mysql2/promise";
import { drizzle, type MySql2Database } from "drizzle-orm/mysql2";
import * as schema from "./schema";

export type FlixaDb = MySql2Database<typeof schema>;

let pool: Pool | null = null;
let db: FlixaDb | null = null;

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Variável de ambiente ausente: ${name}`);
  }
  return value;
}

export function getMysqlPool() {
  if (pool) return pool;

  pool = createPool({
    host: requiredEnv("MYSQL_HOST"),
    port: Number(process.env.MYSQL_PORT || "3306"),
    user: requiredEnv("MYSQL_USER"),
    password: requiredEnv("MYSQL_PASSWORD"),
    database: requiredEnv("MYSQL_DATABASE"),
    waitForConnections: true,
    connectionLimit: 5,
    enableKeepAlive: true,
    timezone: "Z",
    dateStrings: true,
    // Na Hostinger, use MYSQL_HOST=localhost (não o hostname público srv….hstgr.io).
    connectTimeout: Number(process.env.MYSQL_CONNECT_TIMEOUT_MS || "8000"),
  });

  return pool;
}

export async function getDb() {
  if (db) return db;
  db = drizzle(getMysqlPool(), { schema, mode: "default" });
  return db;
}

export async function closeDb() {
  if (pool) {
    await pool.end();
  }
  pool = null;
  db = null;
}
