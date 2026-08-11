import path from "node:path";
import { startProdServer } from "vinext/server/prod-server";

/**
 * Entrada local / alternativa ESM (sem top-level await).
 * Na Hostinger use server.cjs no campo Entry file.
 */
const port = Number(process.env.PORT || 3000);

startProdServer({
  port,
  host: "0.0.0.0",
  outDir: path.resolve(process.cwd(), "dist"),
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
