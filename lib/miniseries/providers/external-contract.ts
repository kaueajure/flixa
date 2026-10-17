import { baseTitle, https, language, positive, record, str, strings } from "../normalize.ts";
import { episodeKey, MiniError, type Episode, type MiniTitle, type Playback, type SourceRef } from "../types.ts";

// Defensive projections of the supplied contract. Unknown envelopes fail closed;
// aliases below remain unverified until an authenticated live response is available.
export function payload(value: unknown): unknown {
  if (Array.isArray(value)) return value;
  const r = record(value);
  if (r.success === false || r.status === false) throw new MiniError("Fornecedor informou falha na operação.", 502);
  return r.data ?? value;
}
export function rows(value: unknown, field?: string): unknown[] {
  const p = payload(value);
  if (Array.isArray(p)) return p;
  const r = record(p); const list = field ? r[field] : r.list ?? r.results ?? r.books;
  if (!Array.isArray(list)) throw new MiniError("Contrato de listagem ainda não validado com esta fonte.", 502);
  return list;
}
export function identifier(value: unknown): string {
  const id = typeof value === "number" && Number.isSafeInteger(value) ? String(value) : str(value);
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) throw new MiniError("Identificador ausente ou incompatível com a fonte.", 502);
  return id;
}
export function projectTitle(value: unknown, ref: SourceRef): MiniTitle {
  const r = record(value); const t = baseTitle(ref.provider, ref.id, str(r.title) || str(r.bookName) || str(r.book_title));
  t.refs = [ref]; t.synopsis = str(r.synopsis) || str(r.introduction) || str(r.description) || undefined;
  t.poster = https(r.cover) || https(r.poster) || https(r.coverWap) || https(r.book_pic); t.imageProvider = ref.provider;
  t.episodeCount = positive(r.chapterCount) || positive(r.episode_count) || positive(r.chapter_count);
  t.genres = strings(r.genres ?? r.tags); t.alternativeTitles = strings(r.alternativeTitles);
  const lang = str(r.lang) || str(r.language); t.languages = lang ? [language(lang)] : [];
  t.metadataLanguage = t.languages.includes("pt") ? "pt" : t.languages.includes("en") ? "en" : undefined;
  t.year = positive(r.year);
  // Only explicit native identifiers are strong cross-provider evidence.
  if (ref.platform === "reelshort" && r.book_id !== undefined) t.externalIds["platform:reelshort"] = identifier(r.book_id);
  if (ref.platform === "dramabox" && r.bookId !== undefined) t.externalIds["platform:dramabox"] = identifier(r.bookId);
  const original = https(r.originalUrl);
  const officialHosts: Record<string, string[]> = { reelshort: ["reelshort.com", "www.reelshort.com"], dramabox: ["dramabox.com", "www.dramabox.com"] };
  if (original && officialHosts[ref.platform || ""]?.includes(new URL(original).hostname)) t.originals = [{ platform: ref.platform!, url: original, verified: true }];
  return t;
}
export function projectEpisodes(value: unknown, ref: SourceRef): Episode[] {
  const list = rows(value, "episodes"); const seen = new Set<string>(); const numbers = new Set<number>();
  return list.map((v) => {
    const r = record(v); const n = positive(r.episode_num) || positive(r.episode) || positive(r.number) || positive(r.ep);
    if (!n || numbers.has(n)) throw new MiniError("Número de episódio ausente ou duplicado.", 502);
    const chapterId = ref.provider === "reelshort" ? identifier(r.chapter_id) : undefined;
    const id = chapterId || String(n);
    if (seen.has(id) || (r.locked !== undefined && typeof r.locked !== "boolean")) throw new MiniError("Estado ou identificador de episódio inválido.", 502);
    seen.add(id); numbers.add(n);
    return { id, chapterId, number: n, key: episodeKey(ref, id), title: str(r.title) || undefined, available: r.locked === false };
  });
}
function publicMedia(value: unknown): string {
  const url = https(value);
  if (!url) throw new MiniError("URL de mídia inválida; HTTPS obrigatório.", 502);
  const host = new URL(url).hostname;
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal") || host.startsWith("[") || /^\d+\.\d+\.\d+\.\d+$/.test(host)) throw new MiniError("Host de mídia inválido.", 502);
  return url;
}
function expiry(r: Record<string, unknown>, url: string, confirmedTtl?: number): number {
  const u = new URL(url);
  const raw = r.expiresAt ?? r.expires_at ?? u.searchParams.get("Expires") ?? u.searchParams.get("expires") ?? u.searchParams.get("exp");
  let absolute = typeof raw === "number" || (typeof raw === "string" && /^\d+$/.test(raw)) ? Number(raw) : typeof raw === "string" ? Date.parse(raw) : NaN;
  if (Number.isFinite(absolute) && absolute < 1e12) absolute *= 1000;
  const ttl = positive(r.expires_in) || confirmedTtl;
  // A plain URL without a query has no advertised signature lifetime. Limit the
  // local playback session to five minutes; do not claim that as upstream expiry.
  const staticUrl = !u.search;
  const until = Math.min(Number.isFinite(absolute) ? absolute : Infinity, ttl ? Date.now() + ttl * 1000 : Infinity, Date.now() + 300000) - 10000;
  if ((!Number.isFinite(absolute) && !ttl && !staticUrl) || until <= Date.now()) throw new MiniError("Validade da URL ausente ou expirada. Confirme o contrato antes de habilitar vídeo.", 502);
  return until;
}
export function projectPlayback(value: unknown, ref: SourceRef): Playback {
  const r = record(payload(value));
  if (r.locked !== false) throw new MiniError("Episódio bloqueado ou estado de acesso não confirmado.", 403);
  const url = publicMedia(r.videoUrl ?? r.video_url);
  const ttl = ref.validation?.playbackTtlSeconds;
  const expiresAt = expiry(r, url, ttl);
  const qualities = Array.isArray(r.qualityList) ? r.qualityList.map((v) => {
    const q = record(v); const qualityUrl = publicMedia(q.videoUrl ?? q.url);
    return { label: str(q.quality) || str(q.label) || (positive(q.quality) || positive(q.height) ? `${positive(q.quality) || positive(q.height)}p` : "Original"), url: qualityUrl, expiresAt: Math.min(expiresAt, expiry({ ...r, ...q }, qualityUrl, ttl)) };
  }) : [];
  const subtitles = r.subtitles === undefined ? [] : rows(r.subtitles).map((v) => {
    const s = record(v); return { lang: str(s.lang), label: str(s.label) || str(s.lang), url: publicMedia(s.url), default: s.default === true };
  });
  return { url, expiresAt, qualities, subtitles, format: new URL(url).pathname.toLowerCase().endsWith(".m3u8") ? "hls" : "mp4" };
}
