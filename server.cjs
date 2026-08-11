const http = require("node:http");
const path = require("node:path");

/**
 * Entry Hostinger / LiteSpeed (lsnode).
 *
 * O lsnode faz require() neste arquivo e exige que http.Server#listen()
 * rode de forma SÍNCRONA durante o require. Se o listen vier só depois
 * (ex.: import().then(...)), o site fica em 503.
 *
 * Fluxo:
 * 1) Cria o server e chama listen() agora (lsnode captura o socket).
 * 2) Carrega o vinext depois e reaproveita o MESMO server (sem 2º listen).
 */
const port = Number(process.env.PORT || 3000);
const outDir = path.resolve(process.cwd(), "dist");

let handleRequest = (_req, res) => {
  res.writeHead(503, {
    "Content-Type": "text/plain; charset=utf-8",
    "Retry-After": "2",
  });
  res.end("Flixa iniciando...");
};

const server = http.createServer((req, res) => {
  handleRequest(req, res);
});

// Obrigatório: listen síncrono para o lsnode.
server.listen(port, "127.0.0.1");
module.exports = server;

const originalCreateServer = http.createServer;
http.createServer = function createServerForVinext(...args) {
  const handler =
    typeof args[0] === "function"
      ? args[0]
      : typeof args[1] === "function"
        ? args[1]
        : null;

  if (handler) {
    handleRequest = handler;
    return server;
  }

  return originalCreateServer.apply(this, args);
};

const originalListen = http.Server.prototype.listen;
http.Server.prototype.listen = function listenOnce(...args) {
  if (this === server) {
    const cb = args.find((arg) => typeof arg === "function");
    if (cb) queueMicrotask(cb);
    return this;
  }
  return originalListen.apply(this, args);
};

import("vinext/server/prod-server")
  .then(({ startProdServer }) =>
    startProdServer({
      port,
      host: "127.0.0.1",
      outDir,
    }),
  )
  .then(() => {
    console.log(`[flixa] vinext pronto em ${outDir}`);
  })
  .catch((err) => {
    console.error("[flixa] falha ao iniciar vinext:", err);
    handleRequest = (_req, res) => {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Falha ao iniciar o Flixa. Veja os Runtime Logs.");
    };
  });
