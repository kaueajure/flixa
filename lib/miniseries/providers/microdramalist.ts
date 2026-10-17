import { baseTitle, https, language, platform, positive, record, str, strings } from "../normalize.ts";
import type { MiniTransport } from "../transport.ts";
import type { MiniTitle } from "../types.ts";

export function microTitle(value: unknown, detail = false): MiniTitle {
  const r = record(value);
  const id = str(r.id);
  if (!/^mdid-[a-z0-9]+$/i.test(id)) throw new Error("MicroDramaList: identificador inválido.");
  const t = baseTitle("microdramalist", id, str(r.title));
  t.detailComplete = detail;
  t.synopsis = str(r.description) || undefined;
  t.poster = https(r.posterUrl); t.imageProvider = "microdramalist";
  if (detail) {
    if (!Array.isArray(r.availableOn)) throw new Error("MicroDramaList: plataformas ausentes.");
    t.alternativeTitles = strings(r.alternativeTitles); t.genres = strings(r.genres);
    t.languages = strings(r.languages).map(language); t.year = positive(r.releaseYear); t.episodeCount = positive(r.episodeCount);
    for (const value of r.availableOn) {
      const o = record(value); const p = platform(str(o.platform)); const externalId = str(o.externalId);
      if (p && externalId && o.unverified !== true) t.externalIds[`platform:${p}`] = externalId;
      const url = https(o.url);
      if (url && p) t.originals.push({ platform: str(o.platform), url, verified: o.unverified !== true, ...(str(o.language) ? { language: language(str(o.language)) } : {}) });
    }
  }
  return t;
}
export class MicroDramaList {
  transport: MiniTransport;
  constructor(transport: MiniTransport) { this.transport = transport; }
  async search(q: string) {
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(q)))).map((b) => b.toString(16).padStart(2, "0")).join("");
    return this.transport.cached(`micro:search:${digest}`, 86400000, async () => {
      const result = await this.transport.request("microdramalist", `https://microdramalist.com/api/v1/search?q=${encodeURIComponent(q)}`);
      if (!Array.isArray(result) || result.length > 20) throw new Error("MicroDramaList: lista inválida.");
      return result.map((r) => microTitle(r));
    });
  }
  detail(id: string) {
    if (!/^mdid-[a-z0-9]+$/i.test(id)) throw new Error("MicroDramaList: ID inválido.");
    return this.transport.cached(`micro:detail:${id}`, 7 * 86400000, async () => microTitle(await this.transport.request("microdramalist", `https://microdramalist.com/api/v1/dramas/${encodeURIComponent(id)}`), true));
  }
}
