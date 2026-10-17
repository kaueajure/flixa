import { sql } from "drizzle-orm";
import { withDb } from "./index.ts";
import type { MiniStore, CacheEntry } from "../lib/miniseries/store.ts";
import type { MiniTitle } from "../lib/miniseries/types.ts";

function json<T>(value: unknown): T { return (typeof value === "string" ? JSON.parse(value) : value) as T; }
type Row = { payload: unknown; expires_at: number; stale_until: number };

/** Existing MySQL is shared by Node workers and the Worker runtime. No filesystem fallback. */
export const miniStore: MiniStore = {
  async get<T>(key: string) {
    return withDb(async (db) => {
      const [rows] = await db.execute(sql`SELECT payload, expires_at, stale_until FROM minisserie_cache WHERE cache_key=${key} LIMIT 1`);
      const row = (rows as unknown as Row[])[0];
      return row ? { value: json<T>(row.payload), expiresAt: Number(row.expires_at), staleUntil: Number(row.stale_until) } : null;
    });
  },
  async put(key, value, ttl, stale = 0) {
    const now = Date.now();
    await withDb((db) => db.execute(sql`INSERT INTO minisserie_cache (cache_key,payload,expires_at,stale_until) VALUES (${key},${JSON.stringify(value)},${now + ttl},${now + ttl + stale}) ON DUPLICATE KEY UPDATE payload=VALUES(payload),expires_at=VALUES(expires_at),stale_until=VALUES(stale_until)`));
  },
  async lease(key, owner, ms) {
    return withDb(async (db) => {
      await db.execute(sql`INSERT IGNORE INTO minisserie_controle (control_key,owner,expires_at,units) VALUES (${key},'',0,0)`);
      await db.execute(sql`UPDATE minisserie_controle SET owner=${owner},expires_at=${Date.now() + ms} WHERE control_key=${key} AND expires_at<=${Date.now()}`);
      const [rows] = await db.execute(sql`SELECT owner FROM minisserie_controle WHERE control_key=${key}`);
      return (rows as unknown as { owner: string }[])[0]?.owner === owner;
    });
  },
  async release(key, owner) {
    await withDb((db) => db.execute(sql`UPDATE minisserie_controle SET expires_at=0 WHERE control_key=${key} AND owner=${owner}`));
  },
  async reserve(key, units, limit, ms) {
    return withDb((db) => db.transaction(async (tx) => {
      await tx.execute(sql`INSERT INTO minisserie_controle (control_key,owner,expires_at,units) VALUES (${key},'',0,0) ON DUPLICATE KEY UPDATE control_key=VALUES(control_key)`);
      const [rows] = await tx.execute(sql`SELECT units,expires_at FROM minisserie_controle WHERE control_key=${key} FOR UPDATE`);
      const row = (rows as unknown as { units: number; expires_at: number }[])[0];
      const current = Number(row.expires_at) > Date.now() ? Number(row.units) : 0;
      if (current + units > limit) return false;
      await tx.execute(sql`UPDATE minisserie_controle SET units=${current + units},expires_at=${current ? Number(row.expires_at) : Date.now() + ms} WHERE control_key=${key}`);
      return true;
    }));
  },
  async titles() {
    return withDb(async (db) => {
      const [rows] = await db.execute(sql`SELECT payload FROM minisserie_titulos ORDER BY created_at,id LIMIT 5000`);
      return (rows as unknown as { payload: unknown }[]).map((r) => json<MiniTitle>(r.payload));
    });
  },
  async budgetUsage(key) {
    return withDb(async (db) => {
      const [rows] = await db.execute(sql`SELECT units,expires_at FROM minisserie_controle WHERE control_key=${key} LIMIT 1`);
      const row = (rows as unknown as { units: number; expires_at: number }[])[0];
      return row && Number(row.expires_at) > Date.now() ? { units: Number(row.units), expiresAt: Number(row.expires_at) } : null;
    });
  },
  async title(id) {
    return withDb(async (db) => {
      const [rows] = await db.execute(sql`SELECT payload FROM minisserie_titulos WHERE id=COALESCE((SELECT title_id FROM minisserie_aliases WHERE alias_id=${id}),${id}) LIMIT 1`);
      return (rows as unknown as { payload: unknown }[])[0] ? json<MiniTitle>((rows as unknown as { payload: unknown }[])[0].payload) : null;
    });
  },
  async save(title, absorbed = []) {
    await withDb((db) => db.transaction(async (tx) => {
      await tx.execute(sql`INSERT INTO minisserie_titulos (id,payload) VALUES (${title.id},${JSON.stringify(title)}) ON DUPLICATE KEY UPDATE payload=VALUES(payload)`);
      for (const id of absorbed) {
        await tx.execute(sql`UPDATE minisserie_aliases SET title_id=${title.id} WHERE title_id=${id}`);
        await tx.execute(sql`INSERT INTO minisserie_aliases (alias_id,title_id) VALUES (${id},${title.id}) ON DUPLICATE KEY UPDATE title_id=VALUES(title_id)`);
        await tx.execute(sql`DELETE FROM minisserie_titulos WHERE id=${id}`);
      }
    }));
  },
  async prune() {
    await withDb(async (db) => {
      await db.execute(sql`DELETE FROM minisserie_cache WHERE stale_until<${Date.now()} LIMIT 500`);
      await db.execute(sql`DELETE FROM minisserie_controle WHERE expires_at<${Date.now() - 86400000} LIMIT 500`);
    });
  },
};
export type { CacheEntry };
