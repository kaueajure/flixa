// Adapted from wanglinsaputra/Rest-Api-ReelShort, MIT, commit
// 95d04d04400bcfc4ce2c77583b1b9702d994fc19. See third_party/reelshort/LICENSE.
// Node backend only. No Express, proxy service, fixed fallback build ID or per-card searches.
import { cacheId, record, str } from "../normalize.ts";
import { distributionAuthorized } from "../authorization.ts";
import { episodeKey, MiniError, type SourceRef } from "../types.ts";
import type { MiniTransport } from "../transport.ts";
import { identifier, projectEpisodes, projectPlayback, projectTitle } from "./external-contract.ts";

export type ReelShortFeed = "newrelease" | "recommended" | "dramadub";
export class ReelShort {
  transport: MiniTransport;
  constructor(transport: MiniTransport) { this.transport = transport; }
  node() {
    if (typeof process === "undefined" || !process.versions?.node || "WebSocketPair" in globalThis) throw new MiniError("ReelShort direto requer o backend Node.js.", 503);
  }
  async home() {
    this.node();
    return this.transport.cached("reelshort:v3:home:pt", 3600000, async () => {
      const response = await this.transport.rawRequest("reelshort", "https://www.reelshort.com/pt");
      const match = response.body.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
      if (!match) throw new MiniError("ReelShort não retornou __NEXT_DATA__; contrato do repositório incompatível.", 502);
      const data = record(JSON.parse(match[1])); const buildId = identifier(data.buildId);
      const props = record(record(data.props).pageProps); const fallback = record(props.fallback);
      const hall = record(fallback["/api/ms/hall/webInfo"]);
      if (!Array.isArray(hall.bookShelfList)) throw new MiniError("ReelShort não retornou as estantes previstas pelo repositório.", 502);
      const shelves = hall.bookShelfList.filter((v) => Array.isArray(record(v).books)).map((v) => {
        const shelf = record(v);
        if (!Array.isArray(shelf.books)) throw new MiniError("Estante ReelShort inválida.", 502);
        // Titles lacking native IDs are omitted, never resolved with one search per card.
        const books = shelf.books.filter((v) => { const b = record(v); return !!(b.book_id ?? b._id); }).slice(0, 100).map((v) => this.title(v));
        return { name: str(shelf.bookshelf_name), books };
      });
      return { buildId, shelves };
    });
  }
  async request(path: string, params: Record<string, string> = {}, play = false) {
    const { buildId } = await this.home();
    return record(await this.transport.request("reelshort", `https://www.reelshort.com/_next/data/${encodeURIComponent(buildId)}/pt/${path}.json?${new URLSearchParams(params)}`, {}, play));
  }
  title(value: unknown) {
    const r = record(value); const id = identifier(r.book_id ?? r._id);
    const name = str(r.book_title); const slug = identifier(name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/ /g, "-"));
    const title = projectTitle({ ...r, book_id: id, description: r.special_desc, genres: r.theme ?? (Array.isArray(r.theme_list) ? r.theme_list.map((v) => str(record(v).tag_name)) : []), language: str(r.lang) || "pt" }, { provider: "reelshort", id, platform: "reelshort", slug });
    title.originals = [{ platform: "ReelShort", url: `https://www.reelshort.com/pt/movie/${encodeURIComponent(slug)}-${encodeURIComponent(id)}`, verified: true }];
    return title;
  }
  async list(feed: ReelShortFeed, query?: string) {
    if (!["newrelease", "recommended", "dramadub"].includes(feed) || (query !== undefined && (query.trim().length < 3 || query.length > 100))) throw new MiniError("Lista ou busca ReelShort inválida.", 400);
    return this.transport.cached(`reelshort:v3:list:pt:${feed}:${await cacheId(query || "")}`, 86400000, async () => {
      let titles;
      if (query) {
        const data = await this.request("search", { keywords: query }); const props = record(data.pageProps);
        if (!Array.isArray(props.books) || props.books.length > 200) throw new MiniError("Resposta de busca ReelShort incompatível com o repositório.", 502);
        titles = props.books.map((v) => this.title(v));
      } else {
        const { shelves } = await this.home();
        const expressions = { newrelease: /(?:Rilis Baru|New Releases|Novos lançamentos|Novos Lancamentos|Novo Lançamento|Lançamentos)/i, recommended: /(?:Lebih Direkomendasikan|More Recommended|Recomendad)/i, dramadub: /(?:Drama.*Dub|Dublad)/i };
        const shelf = shelves.find((s) => expressions[feed].test(s.name));
        if (!shelf) throw new MiniError(`Estante ReelShort ${feed} ausente na resposta real.`, 502);
        titles = shelf.books;
      }
      return { titles, page: 1, hasMore: false };
    });
  }
  async episodes(ref: SourceRef) {
    const id = identifier(ref.id); const slug = identifier(ref.slug);
    const episodes = await this.transport.cached(`reelshort:v3:episodes:pt:${id}:${slug}`, 86400000, async () => {
      const movie = `${slug}-${id}`; const data = await this.request(`movie/${encodeURIComponent(movie)}`, { slug: movie });
      const detail = record(record(data.pageProps).data);
      if (detail.book_id !== undefined && identifier(detail.book_id) !== id) throw new MiniError("ReelShort retornou outra produção.", 502);
      if (!Array.isArray(detail.online_base)) throw new MiniError("Listagem de capítulos ReelShort ausente.", 502);
      const paidStart = typeof detail.paid_start === "number" && Number.isSafeInteger(detail.paid_start) && detail.paid_start > 0 ? detail.paid_start : undefined;
      return projectEpisodes({ episodes: detail.online_base.filter((v) => { const ep = record(v); return typeof ep.serial_number === "number" && ep.serial_number > 0 && ep.chapter_type !== 2; }).map((v) => {
        const ep = record(v); const number = Number(ep.serial_number);
        const confirmedFree = ep.locked === false || (paidStart !== undefined && number < paidStart && ep.status === 1);
        return { ...ep, episode: number, locked: ep.locked === true || !confirmedFree || (paidStart !== undefined && number >= paidStart) };
      }) }, { ...ref, episodeMap: undefined });
    });
    return episodes.map((e) => ({ ...e, key: episodeKey(ref, e.id) }));
  }
  async play(ref: SourceRef, episodeId: string) {
    if (!distributionAuthorized(ref)) throw new MiniError("Autorização de distribuição deste título ausente ou expirada.", 403);
    const ep = (await this.episodes(ref)).find((e) => e.id === episodeId);
    if (!ep?.available || !ep.number || !ep.chapterId) throw new MiniError("Episódio bloqueado ou acesso não confirmado.", 403);
    const slug = `episode-${ep.number}-${identifier(ref.slug)}-${identifier(ref.id)}-${ep.chapterId}`;
    const data = await this.request(`episodes/${encodeURIComponent(slug)}`, { play_time: "1", slug }, true);
    const raw = record(record(data.pageProps).data);
    if (raw.serial_number !== ep.number || (raw.chapter_id !== undefined && identifier(raw.chapter_id) !== ep.chapterId)) throw new MiniError("Resposta ReelShort não corresponde ao episódio selecionado.", 502);
    if (raw.locked === true || raw.is_paid === 1 || raw.is_vip === true) throw new MiniError("O episódio exige acesso pago ou está bloqueado.", 403);
    return projectPlayback({ ...raw, locked: false }, ref);
  }
}
