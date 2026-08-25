import type { PlayerServerDefinition, PlayerServerStatus } from "./player-servers";

export type PlayerServerIssueSeverity = "warning" | "error";
export type PlayerServerIssueStage =
  | "configuration"
  | "network"
  | "http"
  | "embed"
  | "document"
  | "player"
  | "media"
  | "manual";

export type PlayerServerIssue = {
  code: string;
  stage: PlayerServerIssueStage;
  severity: PlayerServerIssueSeverity;
  message: string;
  evidence?: string;
};

export type PlayerServerMediaProbe = {
  url: string;
  status: "passed" | "failed";
  httpStatus: number | null;
  contentType: string;
  message: string;
};

export type PlayerServerEvidence = {
  verification: "automatic" | "manual";
  playbackConfirmed: boolean;
  confidence: "none" | "low" | "medium" | "high";
  contentType: string;
  htmlBytes: number;
  frameOptions: string;
  frameAncestors: string;
  playerSignals: string[];
  iframeUrls: string[];
  mediaUrls: string[];
  mediaProbe: PlayerServerMediaProbe | null;
};

export type PlayerServerEndpointCheck = {
  kind: "movie" | "tv";
  status: PlayerServerStatus;
  httpStatus: number | null;
  latencyMs: number;
  message: string;
  finalUrl: string;
  issues: PlayerServerIssue[];
  evidence: PlayerServerEvidence;
};

export type PlayerServerHealthResult = {
  id: string;
  status: PlayerServerStatus;
  httpStatus: number | null;
  latencyMs: number;
  message: string;
  finalUrl: string;
  testedAt: string;
  checks: PlayerServerEndpointCheck[];
};

const BAD_PAGE = /(?:captcha|valida[cç][aã]o segura|verifica[cç][aã]o humana|checking your browser|just a moment|attention required|404\s*(?:not found)?|page not found|domain (?:is )?for sale|access denied|forbidden|investidor\.blog|site suspenso|account suspended)/i;
const PLAYER_INITIALIZER = /(?:jwplayer\s*\([^)]*\)\s*\.setup|new\s+Playerjs\b|new\s+Hls\b|\.loadSource\s*\(|videojs\s*\(|dashjs\b|shaka\.Player|media-player)/i;
const GENERIC_PLAYER_MARKER = /(?:<video\b|<iframe\b|jwplayer|playerjs|video-js|\bplyr\b|\bhls(?:\.js)?\b|\.m3u8\b|dash\.js|data-player|id=["'][^"']*player|class=["'][^"']*player)/i;

function siteOrigin() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || "https://flixa.app/";
  try {
    return new URL(configured).origin;
  } catch {
    return "https://flixa.app";
  }
}

function siteReferer() {
  return `${siteOrigin()}/`;
}

function emptyEvidence(): PlayerServerEvidence {
  return {
    verification: "automatic",
    playbackConfirmed: false,
    confidence: "none",
    contentType: "",
    htmlBytes: 0,
    frameOptions: "",
    frameAncestors: "",
    playerSignals: [],
    iframeUrls: [],
    mediaUrls: [],
    mediaProbe: null,
  };
}

function issue(
  code: string,
  stage: PlayerServerIssueStage,
  severity: PlayerServerIssueSeverity,
  message: string,
  evidence?: string,
): PlayerServerIssue {
  return { code, stage, severity, message, ...(evidence ? { evidence } : {}) };
}

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

function normalizeEmbeddedText(html: string) {
  return html
    .replace(/\\u002f/gi, "/")
    .replace(/\\\//g, "/")
    .replace(/&amp;/gi, "&");
}

function publicHttpUrl(value: string, base: string) {
  try {
    const url = new URL(value, base);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    const host = url.hostname.toLowerCase();
    if (
      !host
      || host === "localhost"
      || host.endsWith(".localhost")
      || host.endsWith(".local")
      || host === "0.0.0.0"
      || host === "::1"
      || /^127\./.test(host)
      || /^10\./.test(host)
      || /^192\.168\./.test(host)
      || /^169\.254\./.test(host)
      || /^172\.(?:1[6-9]|2\d|3[01])\./.test(host)
    ) return null;
    return url;
  } catch {
    return null;
  }
}

function uniqueUrls(values: string[], base: string, limit: number) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const url = publicHttpUrl(value.trim(), base);
    if (!url || seen.has(url.href)) continue;
    seen.add(url.href);
    result.push(url.href);
    if (result.length >= limit) break;
  }
  return result;
}

async function fetchFollowingPublicRedirects(url: string, init: RequestInit) {
  const initial = publicHttpUrl(url, url);
  if (!initial) throw new Error("URL pública inválida");
  let current: URL = initial;
  for (let redirectCount = 0; redirectCount <= 5; redirectCount += 1) {
    const response: Response = await fetch(current, { ...init, redirect: "manual" });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location: string | null = response.headers.get("location");
    await response.body?.cancel().catch(() => undefined);
    const next: URL | null = location ? publicHttpUrl(location, current.href) : null;
    if (!next) throw new Error("O servidor redirecionou para um endereço inválido");
    current = next;
  }
  throw new Error("O servidor excedeu o limite de redirecionamentos");
}

function extractResourceEvidence(html: string, base: string) {
  const normalized = normalizeEmbeddedText(html);
  const iframeCandidates = [...normalized.matchAll(/<iframe\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)]
    .map((match) => match[1]);
  const attributeCandidates = [...normalized.matchAll(/(?:\bsrc|\bfile|\bsource)\s*[:=]\s*["']([^"']+)["']/gi)]
    .map((match) => match[1]);
  const absoluteCandidates = normalized.match(/https?:\/\/[^\s"'<>]+/gi) ?? [];
  const mediaCandidates = [...attributeCandidates, ...absoluteCandidates]
    .map((value) => value.replace(/[),;]+$/, ""))
    .filter((value) => {
      try {
        return /\.(?:m3u8|mpd|mp4)$/i.test(new URL(value, base).pathname);
      } catch {
        return false;
      }
    });

  const iframeUrls = uniqueUrls(iframeCandidates, base, 5);
  const mediaUrls = uniqueUrls(mediaCandidates, base, 5);
  const playerSignals: string[] = [];
  if (/<video\b/i.test(normalized)) playerSignals.push("elemento <video>");
  if (PLAYER_INITIALIZER.test(normalized)) playerSignals.push("inicializador JavaScript de player");
  if (iframeUrls.length > 0) playerSignals.push(`${iframeUrls.length} iframe(s) interno(s)`);
  if (mediaUrls.some((url) => /\.m3u8(?:\?|$)/i.test(url))) playerSignals.push("manifesto HLS");
  if (mediaUrls.some((url) => /\.mpd(?:\?|$)/i.test(url))) playerSignals.push("manifesto DASH");
  if (mediaUrls.some((url) => /\.mp4(?:\?|$)/i.test(url))) playerSignals.push("arquivo MP4");
  if (playerSignals.length === 0 && GENERIC_PLAYER_MARKER.test(normalized)) playerSignals.push("marcador genérico de player");

  return { iframeUrls, mediaUrls, playerSignals };
}

function frameAncestorsDirective(csp: string) {
  return csp.match(/(?:^|;)\s*frame-ancestors\s+([^;]+)/i)?.[1]?.trim() ?? "";
}

function frameAncestorsAllowsOrigin(directive: string, parentOrigin: string, responseUrl: string) {
  if (!directive) return true;
  const target = new URL(parentOrigin);
  const response = new URL(responseUrl);
  const tokens = directive.split(/\s+/).map((token) => token.trim()).filter(Boolean);
  if (tokens.includes("'none'")) return false;
  return tokens.some((token) => {
    if (token === "*") return true;
    if (token === "'self'") return target.origin === response.origin;
    if (token === `${target.protocol}`) return true;
    try {
      if (token.includes("*.")) {
        const wildcard = new URL(token.replace("*.", "placeholder."));
        const suffix = wildcard.hostname.replace(/^placeholder\./, "");
        return target.protocol === wildcard.protocol && (target.hostname === suffix || target.hostname.endsWith(`.${suffix}`));
      }
      return new URL(token).origin === target.origin;
    } catch {
      return false;
    }
  });
}

function frameAncestorsAllowsSite(directive: string, responseUrl: string) {
  return frameAncestorsAllowsOrigin(directive, siteOrigin(), responseUrl);
}

async function readResponsePrefix(response: Response, maxBytes = 64_000) {
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (total < maxBytes) {
      const { value, done } = await reader.read();
      if (done || !value) break;
      const remaining = maxBytes - total;
      const chunk = value.byteLength > remaining ? value.slice(0, remaining) : value;
      chunks.push(chunk);
      total += chunk.byteLength;
      if (value.byteLength > remaining) break;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  const joined = new Uint8Array(total);
  let offset = 0;
  chunks.forEach((chunk) => {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  });
  return joined;
}

async function fetchMediaPrefix(url: string, referer: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetchFollowingPublicRedirects(url, {
      method: "GET",
      cache: "no-store",
      headers: {
        Accept: "application/vnd.apple.mpegurl,application/dash+xml,video/mp4,video/*;q=0.9,*/*;q=0.5",
        Range: "bytes=0-65535",
        Referer: referer,
      },
      signal: controller.signal,
    });
    const bytes = await readResponsePrefix(response);
    return { response, bytes };
  } finally {
    clearTimeout(timer);
  }
}

async function inspectNestedFrame(url: string, parentUrl: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetchFollowingPublicRedirects(url, {
      method: "GET",
      cache: "no-store",
      headers: {
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        Referer: parentUrl,
        "Sec-Fetch-Dest": "iframe",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "cross-site",
      },
      signal: controller.signal,
    });
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    const bytes = await readResponsePrefix(response, 180_000);
    const html = new TextDecoder().decode(bytes);
    const summary = readablePageSummary(html);
    if (!response.ok) {
      return { resources: null, problem: issue("NESTED_IFRAME_HTTP_ERROR", "http", "warning", `O player interno respondeu HTTP ${response.status}`, response.url || url), blocking: false };
    }
    const parentOrigin = new URL(parentUrl).origin;
    const childOrigin = new URL(response.url || url).origin;
    const frameOptions = response.headers.get("x-frame-options")?.toLowerCase() ?? "";
    if (/\bdeny\b/.test(frameOptions) || (/\bsameorigin\b/.test(frameOptions) && parentOrigin !== childOrigin)) {
      return { resources: null, problem: issue("NESTED_IFRAME_BLOCKED_X_FRAME_OPTIONS", "embed", "error", "O player interno bloqueia o iframe do provedor", `X-Frame-Options: ${frameOptions}`), blocking: true };
    }
    const frameAncestors = frameAncestorsDirective(response.headers.get("content-security-policy") ?? "");
    if (frameAncestors && !frameAncestorsAllowsOrigin(frameAncestors, parentOrigin, response.url || url)) {
      return { resources: null, problem: issue("NESTED_IFRAME_BLOCKED_CSP", "embed", "error", "A política CSP bloqueia o player interno", `frame-ancestors ${frameAncestors}`), blocking: true };
    }
    if (BAD_PAGE.test(summary)) {
      return { resources: null, problem: issue("NESTED_IFRAME_INVALID", "document", "warning", "O iframe interno abriu uma página de erro ou bloqueio", summary.slice(0, 150)), blocking: false };
    }
    if (contentType && !/text\/html|application\/xhtml\+xml/.test(contentType)) {
      return { resources: null, problem: issue("NESTED_IFRAME_CONTENT_TYPE", "document", "warning", "O iframe interno retornou conteúdo inesperado", contentType), blocking: false };
    }
    return { resources: extractResourceEvidence(html, response.url || url), problem: null, blocking: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha no iframe interno";
    return {
      resources: null,
      problem: issue(/abort/i.test(message) ? "NESTED_IFRAME_TIMEOUT" : "NESTED_IFRAME_NETWORK_ERROR", "network", "warning", /abort/i.test(message) ? "Tempo limite ao abrir o player interno" : message.slice(0, 180)),
      blocking: false,
    };
  } finally {
    clearTimeout(timer);
  }
}

function firstManifestResource(text: string, base: string) {
  const candidate = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith("#"));
  return candidate ? publicHttpUrl(candidate, base)?.href ?? null : null;
}

async function probeMedia(url: string, referer: string): Promise<PlayerServerMediaProbe> {
  try {
    const { response, bytes } = await fetchMediaPrefix(url, referer);
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (!response.ok && response.status !== 206) {
      return { url, status: "failed", httpStatus: response.status, contentType, message: `Mídia respondeu HTTP ${response.status}` };
    }

    const pathname = new URL(url).pathname.toLowerCase();
    const text = new TextDecoder().decode(bytes);
    if (pathname.endsWith(".m3u8")) {
      if (!/^#EXTM3U/m.test(text)) {
        return { url, status: "failed", httpStatus: response.status, contentType, message: "A URL HLS não retornou um manifesto válido" };
      }
      const resourceUrl = firstManifestResource(text, response.url || url);
      if (!resourceUrl) {
        return { url, status: "failed", httpStatus: response.status, contentType, message: "Manifesto HLS sem variante ou segmento utilizável" };
      }
      const child = await fetchMediaPrefix(resourceUrl, response.url || referer);
      if (!child.response.ok && child.response.status !== 206) {
        return { url, status: "failed", httpStatus: child.response.status, contentType, message: `Primeiro recurso HLS respondeu HTTP ${child.response.status}` };
      }
      const childText = new TextDecoder().decode(child.bytes);
      if (/^#EXTM3U/m.test(childText)) {
        const segmentUrl = firstManifestResource(childText, child.response.url || resourceUrl);
        if (!segmentUrl) {
          return { url, status: "failed", httpStatus: child.response.status, contentType, message: "Variante HLS sem segmento utilizável" };
        }
        const segment = await fetchMediaPrefix(segmentUrl, child.response.url || resourceUrl);
        if ((!segment.response.ok && segment.response.status !== 206) || segment.bytes.byteLength === 0) {
          return { url, status: "failed", httpStatus: segment.response.status, contentType, message: `Primeiro segmento HLS indisponível · HTTP ${segment.response.status}` };
        }
      } else if (child.bytes.byteLength === 0) {
        return { url, status: "failed", httpStatus: child.response.status, contentType, message: "Primeiro segmento HLS retornou vazio" };
      }
      return { url, status: "passed", httpStatus: response.status, contentType, message: "Manifesto HLS e primeiro segmento acessíveis" };
    }

    if (pathname.endsWith(".mpd")) {
      const valid = /<MPD\b/i.test(text) && /<Period\b/i.test(text);
      return {
        url,
        status: valid ? "passed" : "failed",
        httpStatus: response.status,
        contentType,
        message: valid ? "Manifesto DASH válido e acessível" : "A URL DASH não retornou um manifesto válido",
      };
    }

    const signature = new TextDecoder("latin1").decode(bytes.slice(0, 32));
    const validMp4 = /video\/mp4/i.test(contentType) || /ftyp/.test(signature);
    return {
      url,
      status: validMp4 && bytes.byteLength > 0 ? "passed" : "failed",
      httpStatus: response.status,
      contentType,
      message: validMp4 && bytes.byteLength > 0 ? "Arquivo MP4 respondeu com bytes de vídeo" : "A URL MP4 não retornou dados reconhecíveis de vídeo",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao acessar mídia";
    return {
      url,
      status: "failed",
      httpStatus: null,
      contentType: "",
      message: /abort/i.test(message) ? "Tempo limite ao validar a mídia" : message.slice(0, 180),
    };
  }
}

function failedCheck(
  kind: "movie" | "tv",
  url: string,
  startedAt: number,
  issues: PlayerServerIssue[],
  evidence: PlayerServerEvidence,
  httpStatus: number | null,
  finalUrl = url,
): PlayerServerEndpointCheck {
  return {
    kind,
    status: "offline",
    httpStatus,
    latencyMs: Date.now() - startedAt,
    message: issues.find((item) => item.severity === "error")?.message ?? "Falha no player",
    finalUrl,
    issues,
    evidence,
  };
}

async function testEndpoint(
  server: PlayerServerDefinition,
  kind: "movie" | "tv",
  url: string,
): Promise<PlayerServerEndpointCheck> {
  const startedAt = Date.now();
  const issues: PlayerServerIssue[] = [];
  const evidence = emptyEvidence();
  if (!server.protectedEmbedCompatible) {
    issues.push(issue(
      "SANDBOX_COMPATIBILITY_RISK",
      "configuration",
      "warning",
      server.compatibilityMessage || "O provedor pode não funcionar com o iframe protegido",
    ));
  }
  if (server.blockedReason) {
    issues.push(issue("KNOWN_PROVIDER_ISSUE", "configuration", "warning", server.blockedReason));
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetchFollowingPublicRedirects(url, {
      method: "GET",
      cache: "no-store",
      headers: {
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.7",
        Referer: siteReferer(),
        "Sec-Fetch-Dest": "iframe",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "cross-site",
      },
      signal: controller.signal,
    });
    const captchaRequired = response.headers.get("x-cloudflare-captcha") === "required"
      || response.headers.get("cf-mitigated") === "challenge";
    const frameOptions = response.headers.get("x-frame-options")?.toLowerCase() ?? "";
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    const csp = response.headers.get("content-security-policy") ?? "";
    const frameAncestors = frameAncestorsDirective(csp);
    const html = (await response.text()).slice(0, 180_000);
    const summary = readablePageSummary(html);
    evidence.contentType = contentType;
    evidence.htmlBytes = html.length;
    evidence.frameOptions = frameOptions;
    evidence.frameAncestors = frameAncestors;

    if (!response.ok) {
      issues.push(issue("HTTP_ERROR", "http", "error", `Endpoint respondeu HTTP ${response.status}`, summary.slice(0, 140)));
      return failedCheck(kind, url, startedAt, issues, evidence, response.status, response.url || url);
    }
    if (/\bdeny\b|\bsameorigin\b/.test(frameOptions)) {
      issues.push(issue("IFRAME_BLOCKED_X_FRAME_OPTIONS", "embed", "error", "O servidor impede iframe externo", `X-Frame-Options: ${frameOptions}`));
      return failedCheck(kind, url, startedAt, issues, evidence, response.status, response.url || url);
    }
    if (frameAncestors && !frameAncestorsAllowsSite(frameAncestors, response.url || url)) {
      issues.push(issue("IFRAME_BLOCKED_CSP", "embed", "error", "A política CSP não permite incorporar o player no Flixa", `frame-ancestors ${frameAncestors}`));
      return failedCheck(kind, url, startedAt, issues, evidence, response.status, response.url || url);
    }
    if (captchaRequired || BAD_PAGE.test(summary)) {
      issues.push(issue(
        captchaRequired ? "ANTI_BOT_CHALLENGE" : "INVALID_DOCUMENT",
        captchaRequired ? "http" : "document",
        "error",
        captchaRequired ? "Cloudflare exige CAPTCHA" : "A resposta é uma página de erro, bloqueio ou domínio estacionado",
        summary.slice(0, 160),
      ));
      return failedCheck(kind, url, startedAt, issues, evidence, response.status, response.url || url);
    }
    if (contentType && !/text\/html|application\/xhtml\+xml/.test(contentType)) {
      issues.push(issue("UNEXPECTED_CONTENT_TYPE", "document", "error", "O endpoint não retornou uma página HTML", contentType));
      return failedCheck(kind, url, startedAt, issues, evidence, response.status, response.url || url);
    }
    if (html.trim().length < 250) {
      issues.push(issue("EMPTY_DOCUMENT", "document", "error", "A resposta está vazia ou incompleta", `${html.length} bytes`));
      return failedCheck(kind, url, startedAt, issues, evidence, response.status, response.url || url);
    }

    const resources = extractResourceEvidence(html, response.url || url);
    evidence.iframeUrls = resources.iframeUrls;
    evidence.mediaUrls = resources.mediaUrls;
    evidence.playerSignals = resources.playerSignals;
    if (resources.mediaUrls.length === 0 && resources.iframeUrls.length > 0) {
      const nested = await inspectNestedFrame(resources.iframeUrls[0], response.url || url);
      if (nested.problem) issues.push(nested.problem);
      if (nested.blocking) {
        return failedCheck(kind, url, startedAt, issues, evidence, response.status, response.url || url);
      }
      if (nested.resources) {
        resources.mediaUrls = [...new Set([...resources.mediaUrls, ...nested.resources.mediaUrls])].slice(0, 5);
        resources.iframeUrls = [...new Set([...resources.iframeUrls, ...nested.resources.iframeUrls])].slice(0, 5);
        resources.playerSignals = [...new Set([
          ...resources.playerSignals,
          ...nested.resources.playerSignals.map((signal) => `iframe interno: ${signal}`),
        ])];
      }
    }
    evidence.iframeUrls = resources.iframeUrls;
    evidence.mediaUrls = resources.mediaUrls;
    evidence.playerSignals = resources.playerSignals;

    if (resources.playerSignals.length === 0) {
      issues.push(issue("PLAYER_NOT_FOUND", "player", "error", "A página abriu, mas nenhum player reconhecível foi encontrado"));
      return failedCheck(kind, url, startedAt, issues, evidence, response.status, response.url || url);
    }

    if (resources.mediaUrls.length > 0) {
      const mediaProbes: PlayerServerMediaProbe[] = [];
      for (const mediaUrl of resources.mediaUrls.slice(0, 3)) {
        const probe = await probeMedia(mediaUrl, response.url || url);
        mediaProbes.push(probe);
        if (probe.status === "passed") break;
      }
      evidence.mediaProbe = mediaProbes.find((probe) => probe.status === "passed") ?? mediaProbes[0] ?? null;
      const failedBeforeSuccess = mediaProbes.findIndex((probe) => probe.status === "passed");
      if (evidence.mediaProbe?.status === "passed") {
        if (failedBeforeSuccess > 0) {
          issues.push(issue(
            "PRIMARY_MEDIA_FAILED",
            "media",
            "warning",
            "A primeira mídia falhou; o provedor depende de uma fonte interna reserva",
            mediaProbes[0]?.message,
          ));
        }
        evidence.confidence = "high";
        return {
          kind,
          status: issues.some((item) => item.severity === "warning") ? "degraded" : "online",
          httpStatus: response.status,
          latencyMs: Date.now() - startedAt,
          message: evidence.mediaProbe.message,
          finalUrl: response.url || url,
          issues,
          evidence,
        };
      }
      if (evidence.mediaProbe) {
        issues.push(issue("MEDIA_PROBE_FAILED", "media", "warning", evidence.mediaProbe.message, evidence.mediaProbe.url));
      }
    }

    const genericOnly = resources.playerSignals.length === 1 && resources.playerSignals[0] === "marcador genérico de player";
    evidence.confidence = genericOnly ? "low" : resources.iframeUrls.length > 0 || /<video\b/i.test(html) ? "medium" : "low";
    issues.push(issue(
      genericOnly ? "WEAK_PLAYER_EVIDENCE" : "PLAYBACK_NOT_CONFIRMED",
      "player",
      "warning",
      genericOnly
        ? "Há apenas um marcador genérico; o teste automático não comprovou que existe vídeo"
        : "O player foi carregado, mas a reprodução ainda precisa ser confirmada no teste visual",
    ));
    return {
      kind,
      status: "degraded",
      httpStatus: response.status,
      latencyMs: Date.now() - startedAt,
      message: issues.at(-1)?.message ?? "Player encontrado; reprodução não confirmada",
      finalUrl: response.url || url,
      issues,
      evidence,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha de conexão";
    issues.push(issue(
      /abort/i.test(message) ? "NETWORK_TIMEOUT" : "NETWORK_ERROR",
      "network",
      "error",
      /abort/i.test(message) ? "Tempo limite de 12 segundos" : message.slice(0, 180),
    ));
    return failedCheck(kind, url, startedAt, issues, evidence, null);
  } finally {
    clearTimeout(timer);
  }
}

/** Valida uma URL concreta de filme/episódio sem gravar o resultado no banco. */
export function testPlayerSource(
  server: PlayerServerDefinition,
  kind: "movie" | "tv",
  url: string,
) {
  return testEndpoint(server, kind, url);
}

function aggregateStatus(checks: PlayerServerEndpointCheck[]): PlayerServerStatus {
  if (checks.length === 0) return "offline";
  if (checks.every((check) => check.status === "online")) return "online";
  if (checks.every((check) => check.status === "offline")) return "offline";
  return "degraded";
}

export async function testPlayerServer(server: PlayerServerDefinition): Promise<PlayerServerHealthResult> {
  const targets: Array<{ kind: "movie" | "tv"; url: string }> = [];
  if (server.supportsMovie && server.testUrl) targets.push({ kind: "movie", url: server.testUrl });
  if (server.supportsTv && server.testTvUrl) targets.push({ kind: "tv", url: server.testTvUrl });
  const checks = await Promise.all(targets.map((target) => testEndpoint(server, target.kind, target.url)));
  const primary = checks[0];
  const status = aggregateStatus(checks);
  const summary = checks
    .map((check) => `${check.kind === "movie" ? "Filme" : "Série"}: ${check.status === "online" ? "reprodução acessível" : check.status === "degraded" ? `parcial (${check.message})` : check.message}`)
    .join(" · ");

  return {
    id: server.id,
    status,
    httpStatus: primary?.httpStatus ?? null,
    latencyMs: checks.reduce((highest, check) => Math.max(highest, check.latencyMs), 0),
    message: summary || "Nenhum endpoint configurado",
    finalUrl: primary?.finalUrl ?? server.testUrl,
    testedAt: new Date().toISOString(),
    checks,
  };
}

export function applyManualPlaybackConfirmation(
  result: PlayerServerHealthResult,
  kind: "movie" | "tv",
  ok: boolean,
): PlayerServerHealthResult {
  const checks = result.checks.map((check) => {
    if (check.kind !== kind) return check;
    const issues = check.issues.filter((item) => !["PLAYBACK_NOT_CONFIRMED", "WEAK_PLAYER_EVIDENCE", "MANUAL_PLAYBACK_FAILED"].includes(item.code));
    if (!ok) issues.push(issue("MANUAL_PLAYBACK_FAILED", "manual", "error", "O administrador confirmou que o vídeo não reproduz"));
    return {
      ...check,
      status: ok ? "online" as const : "offline" as const,
      message: ok ? "Reprodução confirmada manualmente pelo administrador" : "Falha de reprodução confirmada manualmente pelo administrador",
      issues,
      evidence: {
        ...check.evidence,
        verification: "manual" as const,
        playbackConfirmed: ok,
        confidence: ok ? "high" as const : check.evidence.confidence,
      },
    };
  });
  const status = aggregateStatus(checks);
  return {
    ...result,
    status,
    message: checks
      .map((check) => `${check.kind === "movie" ? "Filme" : "Série"}: ${check.message}`)
      .join(" · "),
    testedAt: new Date().toISOString(),
    checks,
  };
}
