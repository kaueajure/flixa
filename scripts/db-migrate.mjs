import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { createConnection } from "mysql2/promise";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: resolve(root, ".env.local") });
config({ path: resolve(root, ".env") });

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Variável ausente: ${name}`);
  return value;
}

const drizzleDir = resolve(root, "drizzle");
const files = readdirSync(drizzleDir)
  .filter((name) => /^\d+_.+\.sql$/i.test(name))
  .sort((a, b) => a.localeCompare(b, "en"));

const connection = await createConnection({
  host: required("MYSQL_HOST"),
  port: Number(process.env.MYSQL_PORT || "3306"),
  user: required("MYSQL_USER"),
  password: required("MYSQL_PASSWORD"),
  database: required("MYSQL_DATABASE"),
  multipleStatements: true,
  connectTimeout: 20000,
});

try {
  for (const file of files) {
    const sqlPath = resolve(drizzleDir, file);
    const sql = readFileSync(sqlPath, "utf8");
    console.log(`Aplicando migration ${file} ...`);
    try {
      await connection.query(sql);
      console.log(`OK ${file}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Reexecução: coluna já existe
      if (/Duplicate column name|already exists/i.test(message)) {
        console.log(`Ignorado ${file}: ${message}`);
        continue;
      }
      throw error;
    }
  }
  console.log("Migrations aplicadas com sucesso.");
} catch (error) {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  if (code === "ETIMEDOUT" || code === "ENOTFOUND" || code === "ECONNREFUSED") {
    console.error("Falha de rede ao conectar no MySQL. Confira MYSQL_HOST e a porta 3306.");
  }
  throw error;
} finally {
  await connection.end();
}
