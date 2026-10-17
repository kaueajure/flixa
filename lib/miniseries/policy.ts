import { isProvider, type MiniTitle, type Provider, type SourceRef, type Source, sourceKey } from "./types.ts";
import { distributionAuthorized, sylnDramaBox } from "./authorization.ts";
import { MINISERIES_SETTINGS } from "./settings.ts";

export type MiniConfig = {
  enabled: Record<Provider, boolean>;
  playback: Record<Provider, boolean>;
  images: Record<Provider, boolean>;
  dramaBoxMediaHosts: string[];
  sylnToken: string;
};
export function config(): MiniConfig {
  return {
    ...MINISERIES_SETTINGS,
    enabled: { ...MINISERIES_SETTINGS.enabled },
    playback: { ...MINISERIES_SETTINGS.playback },
    images: { ...MINISERIES_SETTINGS.images },
    dramaBoxMediaHosts: [...MINISERIES_SETTINGS.dramaBoxMediaHosts],
    sylnToken: process.env.SYLN_TOKEN?.trim() || "",
  };
}
export function configured(c: MiniConfig, p: Provider) {
  if (!c.enabled[p]) return false;
  if (p === "dramabox") return typeof window === "undefined" && typeof process !== "undefined" && !!process.versions?.node && !("WebSocketPair" in globalThis);
  if (p === "microdramalist") return true;
  if (p === "syln") return !!c.sylnToken;
  if (p === "reelshort") return typeof process !== "undefined" && !!process.versions?.node && !("WebSocketPair" in globalThis);
  return false;
}
export function publicTitle(c: MiniConfig, t: MiniTitle): MiniTitle | null {
  if (!c.enabled[t.metadataProvider]) return null;
  return { ...t, poster: t.imageProvider && c.images[t.imageProvider] ? t.poster : undefined,
    refs: t.refs.filter((r) => isProvider(r.provider)).map((r) => ({ provider: r.provider, id: r.id, platform: r.platform, language: r.language })), originals: t.originals.filter((o) => o.verified) };
}
export function sourceStatus(c: MiniConfig, ref: SourceRef): Source {
  let reason: string | undefined;
  if (ref.provider === "microdramalist") reason = "Fonte de metadados e links oficiais; esta API não fornece episódios.";
  else if (!configured(c, ref.provider)) reason = "Fonte desativada ou aguardando credenciais.";
  else if (!distributionAuthorized(ref)) reason = "Reprodução aguardando autorização de distribuição deste título.";
  else if (!c.playback[ref.provider]) reason = "Reprodução indisponível nesta fonte. Assista na plataforma original.";
  else if (ref.provider === "dramabox" && !c.dramaBoxMediaHosts.length) reason = "CDN DramaBox aguardando validação.";
  return { key: sourceKey(ref), name: `${sylnDramaBox(ref) ? "DramaBox via Syln" : ref.provider === "syln" ? "Syln" : ref.provider === "dramabox" ? "DramaBox" : ref.provider === "reelshort" ? "ReelShort direto" : "MicroDramaList"}${ref.platform && ref.provider !== "dramabox" && !sylnDramaBox(ref) ? ` · ${ref.platform}` : ""}${ref.language ? ` · ${ref.language}` : ""}`, available: !reason, episodesAvailable: ref.provider !== "microdramalist" && configured(c, ref.provider), reason };
}
