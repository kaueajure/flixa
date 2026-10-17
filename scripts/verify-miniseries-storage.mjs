import appSettings from "../config/app.json" with { type: "json" };
// Opt-in integration test against the configured MySQL. Writes only namespaced QA cache/control rows.
import { config } from "dotenv";
import { build } from "esbuild";
import { createConnection } from "mysql2/promise";
import { mkdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
config({ path: ".env.local", quiet: true }); config({ path: ".env", quiet: true });
const qaDirectory = resolve("tmp"); await mkdir(qaDirectory, { recursive: true });
const qaModule = resolve(qaDirectory, "miniseries-storage-qa.mjs");
await build({ stdin: { contents: 'export { miniStore } from "./db/miniseries.ts";', resolveDir: process.cwd() }, outfile: qaModule, bundle: true, platform: "node", format: "esm", packages: "external" });
const { miniStore } = await import(pathToFileURL(qaModule).href);
const key = `qa:${crypto.randomUUID()}`;
let code = 0;
try {
  await miniStore.put(key, { checked: true }, 60000);
  if ((await miniStore.get(key))?.value?.checked !== true) throw Error("Cache roundtrip failed");
  const leases = await Promise.all([miniStore.lease(key, "qa-a", 60000), miniStore.lease(key, "qa-b", 60000)]);
  const usage = await Promise.all(Array.from({ length: 12 }, () => miniStore.reserve(`${key}:budget`, 1, 5, 60000)));
  if (leases.filter(Boolean).length !== 1 || usage.filter(Boolean).length !== 5 || (await miniStore.budgetUsage(`${key}:budget`))?.units !== 5) throw Error("Atomic quota/lease validation failed");
  console.log(JSON.stringify({ mysqlCacheRoundtrip: true, concurrentLeaseWinners: 1, concurrentBudgetAccepted: 5, quotaLimit: 5, catalogRead: Array.isArray(await miniStore.titles()) }));
} catch (error) {
  code = 1; console.error(JSON.stringify({ storageValidation: false, code: error.cause?.code || error.code || "QA_FAILED" }));
} finally {
  const c = await createConnection({ host: process.env.MYSQL_HOST, port: appSettings.mysql.port, user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD, database: process.env.MYSQL_DATABASE, connectTimeout: 10000 });
  try {
    await c.execute("DELETE FROM minisserie_cache WHERE cache_key=?", [key]);
    await c.execute("DELETE FROM minisserie_controle WHERE control_key IN (?,?)", [key, `${key}:budget`]);
  } finally { await c.end(); }
  process.exit(code);
}
