import { sameReference, type MiniTitle, type Provider, type SourceRef } from "./types.ts";

export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Contrato inválido: objeto esperado.");
  return value as Record<string, unknown>;
}
export function str(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
export function strings(value: unknown): string[] { return Array.isArray(value) ? value.map(str).filter(Boolean) : []; }
export function positive(value: unknown) { return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : undefined; }
export function https(value: unknown): string | undefined {
  try {
    const u = new URL(str(value));
    if (u.protocol !== "https:" || u.username || u.password) return;
    return u.href;
  } catch { return; }
}
export function textKey(value: string) { return value.normalize("NFKC").toLocaleLowerCase("en").replace(/\s+/g, " ").trim(); }
export function language(value: string) {
  const aliases: Record<string, string> = { english: "en", portuguese: "pt", portugues: "pt", "português": "pt", chinese: "zh", spanish: "es", indonesian: "id" };
  const v = textKey(value).replace("_", "-");
  return aliases[v] || v;
}
export function platform(value: string) {
  const aliases: Record<string, string> = { "drama box": "dramabox", "drama-box": "dramabox", "kalos tv": "kalostv", "flex tv": "flextv", "reel short": "reelshort" };
  return aliases[textKey(value)] || textKey(value).replace(/\s+/g, "");
}
export function baseTitle(provider: Provider, id: string, title: string): MiniTitle {
  if (!id || !title) throw new Error("Contrato inválido: título ou identificador ausente.");
  return { id: "", title, alternativeTitles: [], metadataProvider: provider, metadataProviders: [provider], genres: [], languages: [], externalIds: {}, refs: [{ provider, id }], originals: [] };
}

/** Never merge on fuzzy names. Conflicting strong identifiers veto a match. */
export function sameProduction(a: MiniTitle, b: MiniTitle) {
  const shared = Object.keys(a.externalIds).filter((k) => b.externalIds[k]);
  if (shared.some((k) => a.externalIds[k] !== b.externalIds[k])) return false;
  if (shared.length) return true;
  if (a.refs.some((x) => b.refs.some((y) => sameReference(x, y)))) return true;
  if (!a.year || a.year !== b.year || !a.episodeCount || a.episodeCount !== b.episodeCount) return false;
  if (!a.languages.length || !a.languages.some((l) => l !== "und" && b.languages.includes(l))) return false;
  const names = [a.title, ...a.alternativeTitles].map(textKey);
  return [b.title, ...b.alternativeTitles].some((n) => names.includes(textKey(n)));
}
export function mergeTitles(existing: MiniTitle, incoming: MiniTitle): MiniTitle {
  // Prefer an explicitly Portuguese Syln row; retain other metadata as fallback.
  const sylnPtIncoming = incoming.metadataProvider === "syln" && incoming.metadataLanguage === "pt";
  const sylnPtExisting = existing.metadataProvider === "syln" && existing.metadataLanguage === "pt";
  const primary = sylnPtIncoming || (!sylnPtExisting && incoming.metadataProvider === "microdramalist") || (existing.metadataProvider === "dramabox" && incoming.metadataProvider === "dramabox" && (incoming.metadataLanguage === "pt" || existing.metadataLanguage !== "pt")) ? incoming : existing;
  const secondary = primary === incoming ? existing : incoming;
  const completeLinks = incoming.metadataProvider === "microdramalist" && incoming.detailComplete ? incoming : existing.metadataProvider === "microdramalist" && existing.detailComplete ? existing : undefined;
  const refs: SourceRef[] = existing.refs.map((r) => ({ ...r }));
  for (const ref of incoming.refs) {
    const old = refs.find((r) => sameReference(r, ref) && r.language === ref.language);
    if (!old) refs.push(ref);
    else {
      if (ref.provider === "dramabox" && !ref.metadataRef) delete old.metadataRef;
      if (ref.slug) old.slug = ref.slug;
      if (ref.episodeMap) { old.episodeMap = ref.episodeMap; old.validation = ref.validation; }
    }
  }
  return {
    ...secondary, ...primary, id: existing.id,
    metadataProviders: [...new Set([...(existing.metadataProviders || [existing.metadataProvider]), ...(incoming.metadataProviders || [incoming.metadataProvider])])],
    detailComplete: primary.detailComplete || secondary.detailComplete,
    synopsis: primary.synopsis || secondary.synopsis,
    poster: primary.poster || secondary.poster,
    imageProvider: primary.poster ? primary.imageProvider : secondary.imageProvider,
    year: primary.year || secondary.year, episodeCount: primary.episodeCount || secondary.episodeCount,
    alternativeTitles: [...new Set([...existing.alternativeTitles, ...incoming.alternativeTitles, secondary.title])].filter((s) => s !== primary.title),
    genres: [...new Set([...primary.genres, ...secondary.genres])], languages: [...new Set([...primary.languages, ...secondary.languages])],
    externalIds: { ...existing.externalIds, ...incoming.externalIds }, refs,
    originals: completeLinks ? completeLinks.originals : [...existing.originals, ...incoming.originals].filter((v, i, all) => all.findIndex((x) => x.url === v.url) === i),
  };
}

/** ASCII, bounded persistent keys even for Unicode search terms. */
export async function cacheId(value: string) {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))).map((n) => n.toString(16).padStart(2, "0")).join("");
}
