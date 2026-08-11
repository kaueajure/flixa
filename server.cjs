const path = require("node:path");

/**
 * Entrada de produção para Hostinger (LiteSpeed lsnode usa require()).
 * Mantém CommonJS (.cjs) para evitar ERR_REQUIRE_ASYNC_MODULE com ESM + top-level await.
 */
const port = Number(process.env.PORT || 3000);

import("vinext/server/prod-server")
  .then(({ startProdServer }) =>
    startProdServer({
      port,
      host: "0.0.0.0",
      outDir: path.resolve(process.cwd(), "dist"),
    }),
  )
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
