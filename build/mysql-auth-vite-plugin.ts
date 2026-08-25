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

function requestPath(url?: string) {
  if (!url) return "";
  return url.split("?")[0] || "";
}

function isMysqlApiPath(pathname: string) {
  return (
    pathname.startsWith("/api/auth/") ||
    pathname === "/api/lista" ||
    pathname === "/api/historico" ||
    pathname === "/api/progresso" ||
    pathname === "/api/admin/usuarios" ||
    pathname === "/api/admin/servidores" ||
    pathname === "/api/admin/catalogo" ||
    pathname === "/api/movies" ||
    pathname === "/api/movies/availability" ||
    pathname === "/api/movies/servers" ||
    pathname === "/api/watch-party/ticket" ||
    pathname === "/api/amigos" ||
    pathname === "/api/amigos/recomendacoes"
  );
}

async function toWebRequest(req: IncomingMessage): Promise<Request> {
  const host = req.headers.host || "localhost";
  const url = `http://${host}${req.url || "/"}`;
  const method = (req.method || "GET").toUpperCase();
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value == null) continue;
    if (Array.isArray(value)) {
      for (const item of value) headers.append(key, item);
    } else {
      headers.set(key, value);
    }
  }

  if (method === "GET" || method === "HEAD") {
    return new Request(url, { method, headers });
  }

  const raw = await readBody(req);
  return new Request(url, {
    method,
    headers,
    body: raw || null,
  });
}

async function sendWebResponse(res: ServerResponse, response: Response) {
  res.statusCode = response.status;
  const cookies = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [];
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() === "set-cookie") return;
    res.setHeader(key, value);
  });
  for (const cookie of cookies) {
    res.appendHeader("Set-Cookie", cookie);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  res.end(buffer);
}

type RouteModule = Partial<
  Record<"GET" | "HEAD" | "POST" | "PUT" | "PATCH" | "DELETE", (request: Request) => Promise<Response> | Response>
>;

async function loadRouteModule(pathname: string): Promise<RouteModule | null> {
  if (pathname === "/api/auth/login") return import("../app/api/auth/login/route");
  if (pathname === "/api/auth/register") return import("../app/api/auth/register/route");
  if (pathname === "/api/auth/logout") return import("../app/api/auth/logout/route");
  if (pathname === "/api/auth/me") return import("../app/api/auth/me/route");
  if (pathname === "/api/auth/account") return import("../app/api/auth/account/route");
  if (pathname === "/api/auth/password-recovery") return import("../app/api/auth/password-recovery/route");
  if (pathname === "/api/lista") return import("../app/api/lista/route");
  if (pathname === "/api/historico") return import("../app/api/historico/route");
  if (pathname === "/api/progresso") return import("../app/api/progresso/route");
  if (pathname === "/api/admin/usuarios") return import("../app/api/admin/usuarios/route");
  if (pathname === "/api/admin/servidores") return import("../app/api/admin/servidores/route");
  if (pathname === "/api/admin/catalogo") return import("../app/api/admin/catalogo/route");
  if (pathname === "/api/movies") return import("../app/api/movies/route");
  if (pathname === "/api/movies/availability") return import("../app/api/movies/availability/route");
  if (pathname === "/api/movies/servers") return import("../app/api/movies/servers/route");
  if (pathname === "/api/watch-party/ticket") return import("../app/api/watch-party/ticket/route");
  if (pathname === "/api/amigos") return import("../app/api/amigos/route");
  if (pathname === "/api/amigos/recomendacoes") return import("../app/api/amigos/recomendacoes/route");
  return null;
}

/**
 * Atende rotas MySQL no Node do Vite (fora do Worker).
 */
export function mysqlAuth(): Plugin {
  return {
    name: "flixa-mysql-auth",
    enforce: "pre",
    configureServer(server) {
      loadEnv({ path: ".env.local", override: false });
      loadEnv({ path: ".env", override: false });

      const handler: Connect.NextHandleFunction = async (req, res, next) => {
        const pathname = requestPath(req.url);
        if (!isMysqlApiPath(pathname)) {
          next();
          return;
        }

        try {
          const mod = await loadRouteModule(pathname);
          const method = (req.method || "GET").toUpperCase() as keyof RouteModule;
          const runner = mod?.[method] || (method === "HEAD" ? mod?.GET : undefined);
          if (!mod || !runner) {
            res.statusCode = 405;
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.end(JSON.stringify({ erro: "Método não permitido." }));
            return;
          }

          const request = await toWebRequest(req);
          const response = await runner(request);
          await sendWebResponse(res, response);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Falha na API";
          const code =
            error && typeof error === "object" && "code" in error ? String((error as { code?: string }).code) : "";
          const dica =
            code === "ETIMEDOUT" || code === "ENOTFOUND" || /Failed query/i.test(message)
              ? " Confira MYSQL_HOST no .env.local e a conexão com o MySQL."
              : "";
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.end(JSON.stringify({ erro: `${message}${dica}` }));
        }
      };

      return () => {
        server.middlewares.stack.unshift({
          route: "",
          handle: handler,
        });
      };
    },
  };
}
