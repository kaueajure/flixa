import type { IncomingMessage, ServerResponse } from "node:http";
import type { Connect, Plugin } from "vite";
import { config as loadEnv } from "dotenv";

async function readBody(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function sendJson(res: ServerResponse, status: number, payload: unknown, headers: Record<string, string> = {}) {
  const body = JSON.stringify(payload);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  for (const [key, value] of Object.entries(headers)) {
    res.setHeader(key, value);
  }
  res.end(body);
}

function authPath(url?: string) {
  if (!url) return "";
  return url.split("?")[0] || "";
}

/**
 * Atende /api/auth/* no Node do Vite (fora do Worker),
 * porque o MySQL da Hostinger usa TCP e não roda no workerd.
 */
export function mysqlAuth(): Plugin {
  return {
    name: "flixa-mysql-auth",
    enforce: "pre",
    configureServer(server) {
      loadEnv({ path: ".env.local", override: false });
      loadEnv({ path: ".env", override: false });

      const handler: Connect.NextHandleFunction = async (req, res, next) => {
        const url = authPath(req.url);
        if (!url.startsWith("/api/auth/")) {
          next();
          return;
        }

        try {
          const auth = await import("../db/auth");
          const { closeDb } = await import("../db/index");

          const runLogin = async (email: string, senha: string) => {
            const usuario = await auth.autenticarUsuario(email, senha);
            if (!usuario) {
              sendJson(res, 401, { erro: "E-mail ou senha inválidos." });
              return;
            }

            const token = await auth.criarSessao(usuario.id);
            sendJson(res, 200, { usuario: auth.paraUsuarioPublico(usuario) }, {
              "Set-Cookie": auth.montarCookieSessao(token),
            });
          };

          const runRegister = async (nome: string, email: string, senha: string) => {
            const resultado = await auth.cadastrarUsuario({ nome, email, senha });
            if (!resultado.usuario) {
              sendJson(res, 400, { erro: resultado.erro || "Não foi possível cadastrar." });
              return;
            }

            const token = await auth.criarSessao(resultado.usuario.id);
            sendJson(res, 201, { usuario: auth.paraUsuarioPublico(resultado.usuario) }, {
              "Set-Cookie": auth.montarCookieSessao(token),
            });
          };

          if (url === "/api/auth/login" && req.method === "POST") {
            const raw = await readBody(req);
            const body = raw ? (JSON.parse(raw) as { email?: string; senha?: string }) : {};
            const email = String(body.email || "").trim().toLowerCase();
            const senha = String(body.senha || "");
            if (!email || !senha) {
              sendJson(res, 400, { erro: "Informe e-mail e senha." });
              return;
            }

            try {
              await runLogin(email, senha);
            } catch {
              await closeDb();
              await runLogin(email, senha);
            }
            return;
          }

          if (url === "/api/auth/register" && req.method === "POST") {
            const raw = await readBody(req);
            const body = raw ? (JSON.parse(raw) as { nome?: string; email?: string; senha?: string }) : {};
            const nome = String(body.nome || "");
            const email = String(body.email || "").trim().toLowerCase();
            const senha = String(body.senha || "");
            if (!nome || !email || !senha) {
              sendJson(res, 400, { erro: "Informe nome, e-mail e senha." });
              return;
            }

            try {
              await runRegister(nome, email, senha);
            } catch {
              await closeDb();
              await runRegister(nome, email, senha);
            }
            return;
          }

          if (url === "/api/auth/logout" && req.method === "POST") {
            const token = auth.lerTokenCookie(req.headers.cookie || null);
            try {
              await auth.encerrarSessao(token);
            } catch {
              await closeDb();
              await auth.encerrarSessao(token);
            }
            sendJson(res, 200, { ok: true }, { "Set-Cookie": auth.montarCookieLogout() });
            return;
          }

          if (url === "/api/auth/me" && (req.method === "GET" || req.method === "HEAD")) {
            const token = auth.lerTokenCookie(req.headers.cookie || null);
            let usuario;
            try {
              usuario = await auth.obterUsuarioPorToken(token);
            } catch {
              await closeDb();
              usuario = await auth.obterUsuarioPorToken(token);
            }
            if (!usuario) {
              sendJson(res, 401, { usuario: null });
              return;
            }
            sendJson(res, 200, { usuario: auth.paraUsuarioPublico(usuario) });
            return;
          }

          sendJson(res, 405, { erro: "Método não permitido." });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Falha na autenticação";
          const code =
            error && typeof error === "object" && "code" in error ? String((error as { code?: string }).code) : "";
          const dica =
            code === "ETIMEDOUT" || code === "ENOTFOUND" || /Failed query/i.test(message)
              ? " Confira MYSQL_HOST no .env.local e a conexão com o MySQL."
              : "";
          sendJson(res, 500, { erro: `${message}${dica}` });
        }
      };

      // Garante prioridade sobre o proxy do Cloudflare/vinext.
      return () => {
        server.middlewares.stack.unshift({
          route: "",
          handle: handler,
        });
      };
    },
  };
}
