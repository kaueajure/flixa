import { baseTitle, cacheId, https, language, platform, positive, record, str, strings, textKey } from "../normalize.ts";
import { episodeKey, MiniError, type Episode, type SourceRef, type Playback, type MiniTitle } from "../types.ts";
import { distributionAuthorized } from "../authorization.ts";
import type { MiniTransport } from "../transport.ts";

function data(value: unknown) { const r = record(value); if (r.success !== true) throw new Error("Syln: resposta sem sucesso."); return r.data; }
export function sylnTitle(value: unknown) {
  const r = record(value); const id = str(r.id);
  if (!/^[a-z0-9_-]+:[a-zA-Z0-9_-]+$/.test(id) || r.content_type !== "short_drama" || r.platform !== id.split(":")[0]) throw new Error("Syln: produção não é short_drama ou ID inconsistente.");
  const t = baseTitle("syln", id, str(r.title));
  t.synopsis = str(r.synopsis) || undefined; t.poster = https(r.poster); t.imageProvider = "syln";
  t.genres = strings(r.tags); t.languages = str(r.lang) && r.lang !== "und" ? [language(str(r.lang))] : [];
  t.episodeCount = positive(r.episode_count);
  t.externalIds[`platform:${platform(str(r.platform))}`] = id.slice(id.indexOf(":") + 1);
  if (/^pt(?:-|$)/.test(t.languages[0] || "")) t.metadataLanguage = "pt";
  else if (/^en(?:-|$)/.test(t.languages[0] || "")) t.metadataLanguage = "en";
  t.refs = [{ provider: "syln", id, platform: str(r.platform), language: str(r.lang) || undefined }];
  return t;
}
export function sylnEpisodes(value: unknown, ref: SourceRef): Episode[] {
  const list = data(value);
  if (!Array.isArray(list)) throw new Error("Syln: lista de episódios inválida.");
  const seen = new Set<string>();
  return list.map((v) => {
    const r = record(v); const n = positive(r.ep);
    if (!n || !Array.isArray(r.resolutions) || r.resolutions.some((x) => !positive(x)) || seen.has(String(n))) throw new Error("Syln: episódio inválido ou duplicado.");
    seen.add(String(n));
    return { id: String(n), key: episodeKey(ref, String(n)), number: n, title: str(r.title) || undefined, duration: positive(r.duration_sec), resolutions: r.resolutions as number[], available: r.resolutions.length > 0 };
  });
}
export function sylnPlayback(value: unknown, expected: string): Playback {
  const r = record(data(value)); const url = https(r.url); const expires = positive(r.expires_in);
  if (!url || new URL(url).hostname !== "cdn.syln.dev" || !expires || expires > 300 || String(r.ep) !== expected) throw new Error("Syln: URL temporária ou episódio inválido.");
  const signedExpiry = Number(new URL(url).searchParams.get("t")) * 1000;
  const expiresAt = Math.min(Date.now() + expires * 1000, signedExpiry || Infinity) - 10000;
  if (expiresAt <= Date.now()) throw new Error("Syln: URL já expirada.");
  if (!Array.isArray(r.subtitles)) throw new Error("Syln: legendas inválidas.");
  return { url, expiresAt, subtitles: r.subtitles.map((v) => {
    const s = record(v); const u = https(s.url);
    if (!u || new URL(u).hostname !== "cdn.syln.dev") throw new Error("Syln: legenda inválida.");
    return { lang: str(s.lang), url: u, label: str(s.label), default: s.default === true };
  }) };
}
export type SylnPlatform = { platform: string; enabled: boolean; titles?: number };
export type SylnPage = { titles: MiniTitle[]; hasMore: boolean; page: number };
export type SylnOptions = { platform?: string; hasMedia?: boolean; language?: string };
const DAY = 86400000;
export function sylnPlatforms(value: unknown): SylnPlatform[] {
  const rows = data(value);
  if (!Array.isArray(rows)) throw new MiniError("Syln: plataformas inválidas.", 502);
  return rows.map((v) => {
    const r = record(v); const name = str(r.platform);
    if (!/^[a-z0-9_-]{1,32}$/.test(name) || typeof r.enabled !== "boolean") throw new MiniError("Syln: configuração de plataforma inválida.", 502);
    return { platform: name, enabled: r.enabled, titles: positive(r.titles) };
  });
}
export function sylnLanguages(value: unknown, expectedPlatform: string): string[] {
  const r = record(value); const rows = data(r);
  if (r.platform !== expectedPlatform || !Array.isArray(rows)) throw new MiniError("Syln: idiomas de outra plataforma.", 502);
  return [...new Set(rows.map((v) => {
    const code = language(str(record(v).lang));
    if (!/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/.test(code)) throw new MiniError("Syln: código de idioma inválido.", 502);
    return code;
  }))];
}
export function sylnPage(value: unknown, page: number, limit: number, expectedPlatform?: string): SylnPage {
  const r = record(value); const rows = data(r); const meta = record(r.meta);
  if (!Array.isArray(rows) || meta.count !== rows.length || meta.page !== page || meta.limit !== limit || rows.length > limit || (expectedPlatform && r.platform !== expectedPlatform)) throw new MiniError("Syln: paginação ou plataforma inválida.", 502);
  const titles = rows.map(sylnTitle);
  const ids = titles.map((t) => t.refs[0].id);
  if (new Set(ids).size !== ids.length || (expectedPlatform && titles.some((t) => t.refs[0].platform !== expectedPlatform))) throw new MiniError("Syln: título duplicado ou pertencente a outra plataforma.", 502);
  return { titles, hasMore: rows.length === limit, page };
}
export async function sylnCacheKey(path: string, params: URLSearchParams) {
  const canonical = new URLSearchParams(params); canonical.sort();
  return `syln:v3:${path}:${await cacheId(canonical.toString())}`;
}
export class Syln {
  transport: MiniTransport; token: string;
  constructor(transport: MiniTransport, token: string) { this.transport = transport; this.token = token; }
  request(path: string, play = false) { return this.transport.request("syln", `https://api.syln.dev/v1/${path}`, { Authorization: `Bearer ${this.token}` }, play); }
  platforms() {
    return this.transport.cached("syln:v3:platforms", DAY, async () => sylnPlatforms(await this.request("platforms")));
  }
  languages(origin: string) {
    if (!/^[a-z0-9_-]{1,32}$/.test(origin)) throw new MiniError("Plataforma Syln inválida.", 400);
    return this.transport.cached(`syln:v3:languages:${origin}`, DAY, async () => sylnLanguages(await this.request(`languages?platform=${encodeURIComponent(origin)}`), origin));
  }
  private async listing(path: "catalog" | "search", page: number, options: SylnOptions, query?: string) {
    if (!Number.isSafeInteger(page) || page < 1 || page > 210) throw new MiniError("Página Syln inválida.", 400);
    const params = new URLSearchParams({ content_type: "short_drama", limit: "24", page: String(page) });
    if (options.platform) {
      if (!/^[a-z0-9_-]{1,32}$/.test(options.platform)) throw new MiniError("Plataforma Syln inválida.", 400);
      params.set("platform", options.platform);
    }
    if (options.hasMedia) params.set("has_media", "true");
    if (options.language) params.set("lang", options.language);
    if (query !== undefined) params.set("q", textKey(query));
    const key = await sylnCacheKey(path, params);
    return this.transport.cached(key, DAY, async () => sylnPage(await this.request(`${path}?${params}`), page, 24, options.platform));
  }
  catalog(page: number, options: SylnOptions = {}) { return this.listing("catalog", page, options); }
  searchPage(query: string, page = 1, options: SylnOptions = {}) {
    if (textKey(query).length < 3 || query.length > 100) throw new MiniError("Informe um título entre 3 e 100 caracteres.", 400);
    return this.listing("search", page, options, query);
  }
  search(query: string) { return this.searchPage(query).then((r) => r.titles); }
  async dramaBoxCatalog(page: number) {
    const origin = (await this.platforms()).find((p) => p.platform === "dramabox");
    if (!origin?.enabled) throw new MiniError("DramaBox está indisponível no catálogo Syln.", 503);
    const languages = await this.languages("dramabox");
    const base = await this.catalog(page, { platform: "dramabox", hasMedia: true });
    const portuguese = languages.find((l) => /^pt(?:-|$)/.test(l));
    let preferred: SylnPage | undefined; let warning: string | undefined;
    if (portuguese) {
      try { preferred = await this.catalog(page, { platform: "dramabox", hasMedia: true, language: portuguese }); }
      catch (error) { warning = error instanceof MiniError ? error.message : "Catálogo português temporariamente indisponível; demais idiomas preservados."; }
    }
    // One bounded PT page plus the complete-language page. No per-card queries.
    return { ...base, titles: [...(preferred?.titles || []), ...base.titles], languages, portuguese, preferredCount: preferred?.titles.length || 0, baseCount: base.titles.length, warning };
  }
  detail(ref: SourceRef) {
    return this.transport.cached(`syln:v3:detail:${ref.id}:${ref.language || "und"}`, 7 * DAY, async () => {
      const title = sylnTitle(data(await this.request(`titles/${encodeURIComponent(ref.id)}${ref.language ? `?lang=${encodeURIComponent(ref.language)}` : ""}`)));
      if (title.refs[0].id !== ref.id) throw new MiniError("Syln: detalhes de outra minissérie.", 502);
      return { ...title, detailComplete: true };
    });
  }
  episodes(ref: SourceRef) {
    return this.transport.cached(`syln:episodes:${ref.id}`, DAY, async () => sylnEpisodes(await this.request(`titles/${encodeURIComponent(ref.id)}/episodes`), { ...ref, episodeMap: undefined }))
      .then((episodes) => episodes.map((e) => ({ ...e, key: episodeKey(ref, e.id) })));
  }
  async play(ref: SourceRef, episode: string) {
    if (!distributionAuthorized(ref)) throw new MiniError("Reprodução DramaBox via Syln aguardando autorização de distribuição deste título.", 403);
    if (!/^[1-9]\d{0,5}$/.test(episode) || Number(episode) > 100000) throw new MiniError("Episódio Syln inválido.", 400);
    return sylnPlayback(await this.request(`titles/${encodeURIComponent(ref.id)}/play/${encodeURIComponent(episode)}`, true), episode);
  }
}
