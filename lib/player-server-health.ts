import type { PlayerServerDefinition, PlayerServerStatus } from "./player-servers";

export type PlayerServerHealthResult = {
  id: string;
  status: PlayerServerStatus;
  httpStatus: number | null;
  latencyMs: number;
  message: string;
  finalUrl: string;
  checks: PlayerServerEndpointCheck[];
};

export type PlayerServerEndpointCheck = {
  kind: "movie" | "tv";
  status: PlayerServerStatus;
  httpStatus: number | null;
  latencyMs: number;
  message: string;
  finalUrl: string;
};

const BAD_PAGE = /(?:captcha|valida[cç][aã]o segura|verifica[cç][aã]o humana|checking your browser|just a moment|attention required|404\s*(?:not found)?|page not found|domain (?:is )?for sale|access denied|forbidden|investidor\.blog|site suspenso|account suspended)/i;
const PLAYER_MARKER = /(?:<video\b|<iframe\b|jwplayer|playerjs|video-js|\bplyr\b|\bhls(?:\.js)?\b|\.m3u8\b|dash\.js|media-player|data-player|id=["'][^"']*player|class=["'][^"']*player)/i;

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

async function testEndpoint(
  kind: "movie" | "tv",
  url: string,
): Promise<PlayerServerEndpointCheck> {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);

  try {
    const response = await fetch(url, {
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
    const captchaRequired = response.headers.get("x-cloudflare-captcha") === "required"
      || response.headers.get("cf-mitigated") === "challenge";
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    const html = (await response.text()).slice(0, 180_000);
    const summary = readablePageSummary(html);

    if (!response.ok) {
      return {
        kind,
        status: "offline",
        httpStatus: response.status,
        latencyMs,
        message: `HTTP ${response.status}${summary ? ` · ${summary.slice(0, 110)}` : ""}`,
        finalUrl: response.url || url,
      };
    }
    if (captchaRequired || BAD_PAGE.test(summary)) {
      return {
        kind,
        status: "offline",
        httpStatus: response.status,
        latencyMs,
        message: captchaRequired ? "Cloudflare exige CAPTCHA" : `Página inválida · ${summary.slice(0, 120)}`,
        finalUrl: response.url || url,
      };
    }
    if (contentType && !/text\/html|application\/xhtml\+xml/.test(contentType)) {
      return {
        kind,
        status: "offline",
        httpStatus: response.status,
        latencyMs,
        message: `Conteúdo inesperado · ${contentType.slice(0, 80)}`,
        finalUrl: response.url || url,
      };
    }
    if (html.trim().length < 250) {
      return {
        kind,
        status: "offline",
        httpStatus: response.status,
        latencyMs,
        message: "Resposta vazia ou incompleta",
        finalUrl: response.url || url,
      };
    }
    if (!PLAYER_MARKER.test(html)) {
      return {
        kind,
        status: "offline",
        httpStatus: response.status,
        latencyMs,
        message: "A página respondeu, mas não contém um player reconhecível",
        finalUrl: response.url || url,
      };
    }

    return {
      kind,
      status: "online",
      httpStatus: response.status,
      latencyMs,
      message: "Player válido; confirme a reprodução no modal",
      finalUrl: response.url || url,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha de conexão";
    return {
      kind,
      status: "offline",
      httpStatus: null,
      latencyMs: Date.now() - startedAt,
      message: /abort/i.test(message) ? "Tempo limite de 12 segundos" : message.slice(0, 180),
      finalUrl: url,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function testPlayerServer(server: PlayerServerDefinition): Promise<PlayerServerHealthResult> {
  const targets: Array<{ kind: "movie" | "tv"; url: string }> = [];
  if (server.supportsMovie && server.testUrl) targets.push({ kind: "movie", url: server.testUrl });
  if (server.supportsTv && server.testTvUrl) targets.push({ kind: "tv", url: server.testTvUrl });
  const checks = await Promise.all(targets.map((target) => testEndpoint(target.kind, target.url)));
  const primary = checks[0];
  const online = checks.length > 0 && checks.every((check) => check.status === "online");
  const summary = checks
    .map((check) => `${check.kind === "movie" ? "Filme" : "Série"}: ${check.status === "online" ? "OK" : check.message}`)
    .join(" · ");

  return {
    id: server.id,
    status: online ? "online" : "offline",
    httpStatus: primary?.httpStatus ?? null,
    latencyMs: checks.reduce((highest, check) => Math.max(highest, check.latencyMs), 0),
    message: summary || "Nenhum endpoint configurado",
    finalUrl: primary?.finalUrl ?? server.testUrl,
    checks,
  };
}
