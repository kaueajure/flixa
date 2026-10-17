export type Provider = "microdramalist" | "syln" | "dramabox" | "reelshort";
export function isProvider(value: unknown): value is Provider {
  return value === "microdramalist" || value === "syln" || value === "dramabox" || value === "reelshort";
}
export type SourceRef = {
  provider: Provider;
  id: string;
  platform?: string;
  language?: string;
  originalUrl?: string;
  slug?: string;
  metadataRef?: string;
  distributionAuthorization?: { reference: string; verifiedAt: string; expiresAt?: string };
  // Explicit, reviewed mapping: logical episode key -> provider episode selector.
  episodeMap?: Record<string, string>;
  validation?: { evidence: string; verifiedAt: string; playbackTtlSeconds?: number };
};
export type OriginalLink = { platform: string; url: string; verified: boolean; language?: string };
export type MiniTitle = {
  id: string;
  title: string;
  alternativeTitles: string[];
  synopsis?: string;
  poster?: string;
  metadataProvider: Provider;
  metadataProviders?: Provider[];
  detailComplete?: boolean;
  metadataLanguage?: "pt" | "en";
  views?: number;
  imageProvider?: Provider;
  genres: string[];
  languages: string[];
  year?: number;
  episodeCount?: number;
  externalIds: Record<string, string>;
  refs: SourceRef[];
  originals: OriginalLink[];
};
export type Episode = { id: string; key: string; chapterId?: string; playbackIndex?: number; number?: number; title?: string; duration?: number; resolutions?: number[]; available: boolean };
export type Playback = { qualities?: { label: string; url: string; expiresAt: number }[]; format?: "mp4" | "hls"; url: string; expiresAt: number; subtitles: { lang: string; url: string; label: string; default: boolean }[] };
export type Source = { key: string; name: string; available: boolean; episodesAvailable?: boolean; reason?: string };
export type TitleDetail = { title: MiniTitle; sources: Source[] };
export type Catalog = { titles: MiniTitle[]; error?: string; page: number; hasMore: boolean; sylnDramaBoxAvailable?: boolean; dramaBoxCategoriesAvailable?: boolean; originalPlatforms?: { name: string; url: string }[] };
export function sourceKey(ref: SourceRef) {
  return `${ref.provider}:${ref.id}${ref.language ? `:${ref.language}` : ""}`;
}
export function sameReference(a: SourceRef, b: SourceRef) {
  return a.provider === b.provider && a.id === b.id;
}
export function episodeKey(ref: SourceRef, id: string) {
  const mapped = Object.entries(ref.episodeMap || {}).find(([, selector]) => selector === id);
  return mapped?.[0] || `${sourceKey(ref)}:episode:${id}`;
}
export class MiniError extends Error {
  status: number;
  constructor(message: string, status = 503) { super(message); this.status = status; }
}
