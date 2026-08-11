import path from "node:path";
import { startProdServer } from "vinext/server/prod-server";

/**
 * Entrada de produção para Hostinger (Node.js Web App).
 * A Hostinger injeta process.env.PORT e espera um arquivo .js.
 */
const port = Number(process.env.PORT || 3000);

await startProdServer({
  port,
  host: "0.0.0.0",
  outDir: path.resolve(process.cwd(), "dist"),
});
