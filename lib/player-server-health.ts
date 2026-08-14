import type { PlayerServerDefinition, PlayerServerStatus } from "./player-servers";

export type PlayerServerHealthResult = {
  id: string;
  status: PlayerServerStatus;
  httpStatus: number | null;
  latencyMs: number;
  message: string;
  finalUrl: string;
};

const BAD_PAGE = /(?:captcha|valida[cç][aã]o segura|verifica[cç][aã]o humana|404\s*(?:not found)?|page not found|domain (?:is )?for sale|access denied|forbidden|investidor\.blog|site suspenso|account suspended)/i;

function readablePageSummary(html: string) {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "";
  const text = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
  return `${title} ${text.slice(0, 2500)}`.trim();
}

export async function testPlayerServer(server: PlayerServerDefinition): Promise<PlayerServerHealthResult> {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);

  try {
    const response = await fetch(server.testUrl, {
      method: "GET",
      redirect: "follow",
      cache: "no-store",
      headers: {
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.7",
      },
      signal: controller.signal,
    });
    const latencyMs = Date.now() - startedAt;
    const captchaRequired = response.headers.get("x-cloudflare-captcha") === "required";
    const html = (await response.text()).slice(0, 180_000);
    const summary = readablePageSummary(html);

    if (!response.ok) {
      return {
        id: server.id,
        status: "offline",
        httpStatus: response.status,
        latencyMs,
        message: `HTTP ${response.status}${summary ? ` · ${summary.slice(0, 110)}` : ""}`,
        finalUrl: response.url || server.testUrl,
      };
    }
    if (captchaRequired || BAD_PAGE.test(summary)) {
      return {
        id: server.id,
        status: "offline",
        httpStatus: response.status,
        latencyMs,
        message: captchaRequired ? "Cloudflare exige CAPTCHA" : `Página inválida · ${summary.slice(0, 120)}`,
        finalUrl: response.url || server.testUrl,
      };
    }
    if (html.trim().length < 250) {
      return {
        id: server.id,
        status: "offline",
        httpStatus: response.status,
        latencyMs,
        message: "Resposta vazia ou incompleta",
        finalUrl: response.url || server.testUrl,
      };
    }

    return {
      id: server.id,
      status: "online",
      httpStatus: response.status,
      latencyMs,
      message: "Player respondeu; confirme a reprodução no modal",
      finalUrl: response.url || server.testUrl,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha de conexão";
    return {
      id: server.id,
      status: "offline",
      httpStatus: null,
      latencyMs: Date.now() - startedAt,
      message: /abort/i.test(message) ? "Tempo limite de 12 segundos" : message.slice(0, 180),
      finalUrl: server.testUrl,
    };
  } finally {
    clearTimeout(timer);
  }
}
