import { baseTitle, cacheId, https, language, platform, positive, record, str, textKey } from "../normalize.ts";
import { MiniError, sourceKey, episodeKey, type Episode, type Playback, type MiniTitle, type SourceRef } from "../types.ts";
import type { MiniTransport } from "../transport.ts";
import { configured, type MiniConfig } from "../policy.ts";
import { dramaBoxSdk, type SdkCall, type DramaBoxMethod } from "./dramabox-sdk.ts";

export const DRAMABOX_ORIGINAL_SITE = "https://www.dramabox.com/pt";
export const DRAMABOX_CAPABILITIES = {
  mode: "node-sdk", originalSite: DRAMABOX_ORIGINAL_SITE,
  catalog: "sdk-cached", search: "sdk-cached", details: "sdk-cached",
  episodes: "sdk-cached", playback: "authorized-mp4-only",
  sdk: { package: "@zhadev/dramabox", version: "0.0.2", enabled: true },
} as const;

/** Use the returned official page URL as-is. Never construct a title or media URL. */
export function officialDramaBoxUrl(value: unknown, id: string) {
  const safe = https(value);
  if (!safe || !/^\d{1,32}$/.test(id)) return;
  const url = new URL(safe);
  if (!new Set(["www.dramabox.com", "dramabox.com", "www.dramaboxdb.com", "dramaboxdb.com"]).has(url.hostname) || url.port) return;
  const segments = url.pathname.split("/");
  if (!segments.some((s) => s === id || s.startsWith(`${id}-`))) return;
  return safe;
}

/** Association only: licensed MicroDramaList metadata remains the provenance.
 * A shared ID alone never creates an official link or a playable server.
 */
export function withDramaBoxReferences(title: MiniTitle): MiniTitle {
  const refs = title.refs.filter((r) => !(r.provider === "dramabox" && r.metadataRef));
  const micro = title.refs.find((r) => r.provider === "microdramalist");
  const id = title.externalIds["platform:dramabox"];
  if (micro && id) {
    for (const original of title.originals) {
      if (!original.verified || platform(original.platform) !== "dramabox") continue;
      const url = officialDramaBoxUrl(original.url, id);
      if (!url) continue;
      const ref: SourceRef = { provider: "dramabox", platform: "dramabox", id, originalUrl: url, metadataRef: micro.id, language: original.language ? language(original.language) : undefined };
      if (!refs.some((r) => sourceKey(r) === sourceKey(ref))) refs.push(ref);
    }
  }
  return { ...title, refs };
}

export function preferPortugueseDramaBox(titles: MiniTitle[]) {
  const priority = (t: MiniTitle) => t.refs.some((r) => r.provider === "dramabox" || (r.provider === "syln" && r.platform === "dramabox")) && (t.languages.some((l) => /^pt(?:-|$)/.test(language(l))) || t.refs.some((r) => (r.provider === "dramabox" || (r.provider === "syln" && r.platform === "dramabox")) && /^pt(?:-|$)/.test(language(r.language || ""))));
  return [...titles].sort((a, b) => Number(priority(b)) - Number(priority(a)));
}

export type DramaBoxCategory = { id: string; name: string; count?: number };
export type DramaBoxFeed = "catalog" | "latest" | "recommended" | "trending" | "category";
const DAY = 86400000;
function identifier(value: unknown) {
  const id = typeof value === "number" && Number.isSafeInteger(value) ? String(value) : str(value);
  if (!/^\d{1,32}$/.test(id)) throw new MiniError("DramaBox: identificador inválido.", 502);
  return id;
}
function data(value: unknown) {
  const r = record(value);
  if (r.success !== true) throw new MiniError("DramaBox: operação sem sucesso.", 502);
  return r.data;
}
function tags(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((v) => typeof v === "string" ? str(v) : str(record(v).tagName) || str(record(v).name)).filter(Boolean))];
}
export function dramaBoxTitle(value: unknown, locale: "pt" | "en" = "pt"): MiniTitle {
  const r = record(value); const id = identifier(r.bookId ?? r.id);
  const t = baseTitle("dramabox", id, str(r.bookName) || str(r.name));
  t.metadataLanguage = locale;
  t.synopsis = str(r.introduction) || undefined;
  t.poster = https(r.cover) || https(r.coverWap); t.imageProvider = "dramabox";
  t.genres = tags(r.tagV3s ?? r.tags); t.episodeCount = positive(r.chapterCount) || positive(r.totalEpisodes);
  t.languages = str(r.language) ? [language(str(r.language))] : [];
  t.externalIds["platform:dramabox"] = id;
  t.refs = [{ provider: "dramabox", platform: "dramabox", id, language: locale }];
  const original = officialDramaBoxUrl(r.url ?? r.bookUrl, id);
  if (original) t.originals.push({ platform: "DramaBox", url: original, verified: true, language: locale });
  if (typeof r.playCount === "number" && Number.isFinite(r.playCount) && r.playCount >= 0) t.views = r.playCount;
  return t;
}
export function dramaBoxEpisodes(value: unknown, ref: SourceRef): Episode[] {
  const r = record(data(value));
  if (identifier(r.bookId) !== ref.id || !Array.isArray(r.chapters)) throw new MiniError("DramaBox: lista de capítulos inconsistente.", 502);
  const ids = new Set<string>(); const indices = new Set<number>();
  return r.chapters.map((v, position) => {
    const c = record(v); const id = identifier(c.chapterId); const index = c.chapterIndex;
    if (typeof index !== "number" || !Number.isSafeInteger(index) || index < 0 || ids.has(id) || indices.has(index)) throw new MiniError("DramaBox: capítulo duplicado ou índice inválido.", 502);
    ids.add(id); indices.add(index);
    const display = str(c.chapterIndexStr);
    return { id, key: episodeKey(ref, id), playbackIndex: index,
      number: /^\d+$/.test(display) ? positive(Number(display)) || position + 1 : position + 1,
      title: str(c.chapterName) || undefined, duration: positive(c.duration), available: c.isCharge === false && c.isLocked === false };
  });
}
export function dramaBoxPlayback(value: unknown, ref: SourceRef, episode: Episode, hosts: string[], now = Date.now()): Playback {
  const response = record(data(value));
  if (response.status !== "success") throw new MiniError("DramaBox: reprodução indisponível.", 502);
  const payload = record(response.data); const chapter = record(payload.chapter);
  if (identifier(payload.bookId) !== ref.id || identifier(chapter.id) !== episode.id || chapter.index !== episode.playbackIndex) throw new MiniError("DramaBox: resposta de outro episódio.", 502);
  const address = https(record(chapter.video).mp4);
  if (!address) throw new MiniError("DramaBox: URL MP4 ausente.", 502);
  const url = new URL(address);
  if (url.port || !hosts.includes(url.hostname) || !/^[a-z0-9.-]+$/i.test(url.hostname) || /^\d+(?:\.\d+){3}$/.test(url.hostname) || /(^|\.)(localhost|local|internal)$/.test(url.hostname)) throw new MiniError("DramaBox: CDN de vídeo não validada.", 502);
  const expiry = Number(url.searchParams.get("Expires") || url.searchParams.get("expires") || url.searchParams.get("exp"));
  const verifiedTtl = ref.validation?.playbackTtlSeconds;
  const knownExpiry = Math.min(expiry > 0 ? expiry * 1000 : Infinity, verifiedTtl && verifiedTtl > 0 && verifiedTtl <= 300 ? now + verifiedTtl * 1000 : Infinity);
  const expiresAt = Number.isFinite(knownExpiry) ? Math.min(knownExpiry, now + 300000) - 10000 : Infinity;
  if (!Number.isFinite(expiresAt) || expiresAt <= now) throw new MiniError("DramaBox: validade da URL desconhecida ou expirada.", 502);
  return { url: address, expiresAt, subtitles: [] };
}

/** Real SDK operations. Only normalized metadata reaches the persistent cache. */
export class DramaBox {
  transport: MiniTransport; config: MiniConfig; call: SdkCall; persist: boolean;
  constructor(transport: MiniTransport, config: MiniConfig, call: SdkCall = dramaBoxSdk(transport), persist = true) {
    this.transport = transport; this.config = config; this.call = call; this.persist = persist;
  }
  private async cached<T>(key: string, ttl: number, load: () => Promise<T>): Promise<T> {
    // Validation probes opt out of persistent metadata caching.
    if (!this.persist) return load();
    if (!configured(this.config, "dramabox")) throw new MiniError("Conector DramaBox desativado.", 403);
    return this.transport.cached(`dramabox:v3:${await cacheId(key)}`, ttl, load, 0, 90000);
  }
  private title(value: unknown, locale: "pt" | "en") {
    const t = dramaBoxTitle(value, locale);
    if (!this.config.images.dramabox) { t.poster = undefined; t.imageProvider = undefined; }
    return t;
  }
  private listing(method: DramaBoxMethod, args: (string | number)[], page: number, size: number, category?: DramaBoxCategory) {
    return this.cached(`${method}:${JSON.stringify(args)}`, DAY, async () => {
      const fetchList = async (locale: "pt" | "en") => {
        const response = await this.call(method, args, locale);
        const raw = data(response);
        let list: unknown; let hasMore: boolean;
        if (method === "getDramaList" || method === "searchDrama") {
          const r = record(raw); list = r.book;
          if (typeof r.isMore !== "boolean") throw new MiniError("DramaBox: paginação inválida.", 502);
          hasMore = r.isMore;
        } else if (method === "getLatest" || method === "getTrending") {
          list = record(raw).results;
          hasMore = method === "getLatest" && Array.isArray(list) && list.length >= size;
        } else { list = raw; hasMore = method === "getBooksByCategory" && Array.isArray(list) && list.length >= size; }
        if (method === "getBooksByCategory") {
          const meta = record(record(response).metadata || {});
          if (positive(meta.page) && meta.page !== page) throw new MiniError("DramaBox: página divergente.", 502);
          hasMore = !!(positive(meta.page) && positive(meta.pages) && Number(meta.page) < Number(meta.pages));
        }
        if (!Array.isArray(list)) throw new MiniError("DramaBox: catálogo inválido.", 502);
        const titles = list.map((v) => this.title(v, locale));
        if (category) titles.forEach((t) => { t.genres = [...new Set([...t.genres, category.name])]; });
        return { titles, hasMore, page };
      };
      const result = await fetchList("pt");
      // No locale retry on errors, access denials or rate limits.
      return result.titles.length ? result : fetchList("en");
    });
  }
  getDramaList(page = 1, size = 24) { return this.listing("getDramaList", [page, size], page, size); }
  getLatest(page = 1) { return this.listing("getLatest", [page], page, 24); }
  getRecommendedBooks() { return this.listing("getRecommendedBooks", [], 1, 24); }
  getTrending() { return this.listing("getTrending", [], 1, 24); }
  searchDrama(query: string, page = 1, size = 24) { return this.listing("searchDrama", [textKey(query), page, size], page, size); }
  getCategories(page = 1, size = 30) {
    return this.cached(`categories:${page}:${size}`, 7 * DAY, async () => {
      const raw = data(await this.call("getCategories", [page, size], "pt"));
      if (!Array.isArray(raw)) throw new MiniError("DramaBox: categorias inválidas.", 502);
      return raw.map((v) => { const r = record(v); const id = identifier(r.typeTwoId); const name = str(r.typeTwoName); if (!name) throw new MiniError("DramaBox: categoria sem nome.", 502); return { id, name, count: positive(r.count) }; });
    });
  }
  async getBooksByCategory(id: string, page = 1, size = 24) {
    const category = (await this.getCategories()).find((c) => c.id === id);
    if (!category) throw new MiniError("Categoria DramaBox não encontrada.", 404);
    return this.listing("getBooksByCategory", [identifier(id), page, size], page, size, category);
  }
  catalog(page = 1, feed: DramaBoxFeed = "catalog", category?: string) {
    if (feed === "latest") return this.getLatest(page);
    if (feed === "recommended") return this.getRecommendedBooks();
    if (feed === "trending") return this.getTrending();
    if (feed === "category") return this.getBooksByCategory(identifier(category), page);
    return this.getDramaList(page);
  }
  getDramaDetail(id: string) {
    return this.cached(`detail:${identifier(id)}`, 7 * DAY, async () => {
      const pt = record(data(await this.call("getDramaDetail", [id], "pt")));
      let title = this.title(pt.detail, "pt");
      if (title.refs[0].id !== id) throw new MiniError("DramaBox: detalhes de outro título.", 502);
      if (!title.synopsis) {
        const en = this.title(record(data(await this.call("getDramaDetail", [id], "en"))).detail, "en");
        if (en.refs[0].id !== id) throw new MiniError("DramaBox: fallback de outro título.", 502);
        title = { ...title, synopsis: en.synopsis, episodeCount: title.episodeCount || en.episodeCount, alternativeTitles: en.title !== title.title ? [en.title] : [] };
      }
      return { ...title, detailComplete: true };
    });
  }
  getChapters(ref: SourceRef) {
    return this.cached(`episodes:${identifier(ref.id)}:${ref.language || "pt"}`, DAY, async () => dramaBoxEpisodes(await this.call("getChapters", [ref.id], ref.language === "en" ? "en" : "pt"), { ...ref, episodeMap: undefined }))
      .then((episodes) => episodes.map((e) => ({ ...e, key: episodeKey(ref, e.id) })));
  }
  episodes(ref: SourceRef) { return this.getChapters(ref); }
  async getEpisodeDetails(ref: SourceRef, episodeId: string) {
    const episode = (await this.getChapters(ref)).find((e) => e.id === episodeId);
    if (!episode) throw new MiniError("Episódio DramaBox não encontrado.", 404);
    return this.cached(`episode:${ref.id}:${episode.id}:${ref.language || "pt"}`, DAY, async () => {
      const r = record(data(await this.call("getEpisodeDetails", [ref.id, episode.playbackIndex!], ref.language === "en" ? "en" : "pt")));
      const detail = record(r.episode);
      if (identifier(r.bookId) !== ref.id || detail.index !== episode.playbackIndex) throw new MiniError("DramaBox: detalhes de outro episódio.", 502);
      return { ...episode, key: episodeKey({ ...ref, episodeMap: undefined }, episode.id), title: str(detail.name) || episode.title, duration: positive(detail.duration) || episode.duration };
    }).then((e) => ({ ...e, key: episodeKey(ref, e.id) }));
  }
  async getStreamUrl(ref: SourceRef, episodeId: string): Promise<Playback> {
    if (!configured(this.config, "dramabox") || !this.config.playback.dramabox) throw new MiniError("Reprodução DramaBox aguardando validação e autorização para este título.", 403);
    const episode = (await this.getChapters(ref)).find((e) => e.id === episodeId);
    if (!episode?.available) throw new MiniError("Episódio DramaBox protegido ou indisponível.", 403);
    const hosts = this.config.dramaBoxMediaHosts;
    if (!hosts.length) throw new MiniError("CDN DramaBox aguardando validação.", 503);
    const value = await this.call("getStreamUrl", [ref.id, episode.playbackIndex!], ref.language === "en" ? "en" : "pt", true);
    const playback = dramaBoxPlayback(value, ref, episode, hosts);
    await this.transport.rawRequest("dramabox", playback.url, {}, true, { method: "HEAD", timeout: 15000 });
    if (playback.expiresAt <= Date.now()) throw new MiniError("URL DramaBox expirou durante a validação.", 502);
    return playback;
  }
  play(ref: SourceRef, episodeId: string) { return this.getStreamUrl(ref, episodeId); }
}
