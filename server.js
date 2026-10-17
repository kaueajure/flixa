import path from "node:path";
import { config as loadEnv } from "dotenv";
import appSettings from "./config/app.json" with { type: "json" };
loadEnv({ path: ".env.local", override: false, quiet: true });
loadEnv({ path: ".env", override: false, quiet: true });
process.env.VINEXT_TRUSTED_HOSTS ??= appSettings.trustedHosts.join(",");
process.env.VINEXT_TRUST_PROXY ??= appSettings.trustProxy ? "1" : "0";

/**
 * Entrada local / alternativa ESM (sem top-level await).
 * Na Hostinger use server.cjs no campo Entry file.
 */
const port = Number(process.env.PORT || 3000);

import("vinext/server/prod-server").then(({ startProdServer }) => startProdServer({
  port,
  host: "0.0.0.0",
  outDir: path.resolve(process.cwd(), "dist"),
})).catch((err) => {
  console.error(err);
  process.exit(1);
});
