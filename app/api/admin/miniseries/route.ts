import { timingSafeEqual } from "node:crypto";
import { requireAdmin } from "../../../../db/auth";
import { miniFailure, miniId, miniService, sourceId } from "../../../../lib/miniseries/server";
import { MiniError, type SourceRef } from "../../../../lib/miniseries/types";
import type { DramaBoxFeed } from "../../../../lib/miniseries/providers/dramabox";
import { record, str } from "../../../../lib/miniseries/normalize";
export const dynamic = "force-dynamic";

function cronAuthorized(request: Request) {
  const expected = process.env.MINISERIES_REFRESH_SECRET?.trim();
  const actual = request.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!expected || !actual) return false;
  const a = Buffer.from(actual); const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
export async function GET(request: Request) {
  try {
    if (!await requireAdmin(request)) throw new MiniError("Acesso restrito a administradores.", 403);
    return Response.json({ providers: await miniService().diagnostics() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return miniFailure(error); }
}
export async function POST(request: Request) {
  try {
    if (request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin) throw new MiniError("Origem inválida.", 403);
    const body = record(await request.json());
    const cron = body.action === "refresh" && cronAuthorized(request);
    if (!cron && !await requireAdmin(request)) throw new MiniError("Acesso restrito a administradores.", 403);
    const service = miniService(); let result: unknown;
    if (body.action === "refreshExternal") {
      if (body.provider !== "reelshort") throw new MiniError("Fornecedor inválido.", 400);
      if (typeof body.page !== "number") throw new MiniError("Página inválida.", 400);
      result = await service.refreshExternal(body.provider, str(body.platform) || "reelshort", str(body.feed), body.page);
    } else if (body.action === "refresh") {
      const page = body.page ?? 1;
      if (typeof page !== "number" || !Number.isSafeInteger(page) || page < 1 || page > 10) throw new MiniError("Atualize uma página de 1 a 10 por vez.", 400);
      if (body.provider !== undefined && body.provider !== "syln" && body.provider !== "dramabox") throw new MiniError("Provedor de atualização inválido.", 400);
      const feed = body.feed ?? "catalog";
      if (typeof feed !== "string" || !["catalog", "latest", "recommended", "trending", "category"].includes(feed) || (feed === "category" && !/^\d{1,32}$/.test(str(body.category)))) throw new MiniError("Lista ou categoria inválida.", 400);
      if ((feed === "recommended" || feed === "trending") && page !== 1) throw new MiniError("Esta lista não oferece paginação.", 400);
      if (body.platform !== undefined && (body.platform !== "dramabox" || body.provider !== "syln")) throw new MiniError("Plataforma de atualização inválida.", 400);
      result = await service.refresh(page, body.provider === "dramabox" ? "dramabox" : "syln", feed as DramaBoxFeed, str(body.category) || undefined, body.platform === "dramabox" ? "dramabox" : undefined);
    } else if (body.action === "authorizePlayback" || body.action === "revokePlayback") {
      const reference = str(body.reference);
      if (body.action === "authorizePlayback" && (!reference || reference.length > 500)) throw new MiniError("Informe a referência da autorização de distribuição deste título.", 400);
      if (body.expiresAt !== undefined && (!str(body.expiresAt) || !(Date.parse(str(body.expiresAt)) > Date.now()))) throw new MiniError("Validade da autorização inválida.", 400);
      result = await service.setDistributionAuthorization(miniId(str(body.id)), sourceId(str(body.source)), body.action === "revokePlayback" ? undefined : { reference, verifiedAt: new Date().toISOString(), expiresAt: str(body.expiresAt) || undefined });
    } else if (body.action === "enrich") {
      result = await service.enrich(miniId(str(body.id)));
    } else if (body.action === "attach") {
      if (!str(body.evidence) || str(body.evidence).length > 500) throw new MiniError("Informe a referência da validação real da correspondência.", 400);
      const r = record(body.ref);
      if ((r.provider !== "syln" && r.provider !== "dramabox" && r.provider !== "reelshort") || !/^[a-zA-Z0-9:_-]{1,100}$/.test(str(r.id)) || !/^[a-z0-9_-]{1,32}$/.test(str(r.platform))) throw new MiniError("Referência inválida.", 400);
      if (r.provider === "dramabox" && (!/^\d{1,32}$/.test(str(r.id)) || r.platform !== "dramabox")) throw new MiniError("Referência DramaBox inválida.", 400);
      if (r.provider === "reelshort" && (r.platform !== "reelshort" || !/^[a-zA-Z0-9_-]{1,100}$/.test(str(r.slug)))) throw new MiniError("Slug ReelShort inválido.", 400);
      if (r.provider === "syln" && !str(r.id).startsWith(`${r.platform}:`)) throw new MiniError("ID Syln inconsistente com a plataforma.", 400);
      if (r.language && !/^[a-zA-Z-]{2,15}$/.test(str(r.language))) throw new MiniError("Idioma inválido.", 400);
      const map = r.episodeMap ? record(r.episodeMap) : {};
      if (Object.keys(map).length > 2000 || Object.entries(map).some(([k, v]) => !/^[a-zA-Z0-9:_-]{1,100}$/.test(k) || typeof v !== "string" || !/^\d{1,6}$/.test(v)) || new Set(Object.values(map)).size !== Object.keys(map).length) throw new MiniError("Mapeamento de episódios inválido ou ambíguo.", 400);
      if (body.playbackTtlSeconds !== undefined && (typeof body.playbackTtlSeconds !== "number" || !Number.isSafeInteger(body.playbackTtlSeconds) || body.playbackTtlSeconds < 1 || body.playbackTtlSeconds > 300)) throw new MiniError("Validade de URL inválida.", 400);
      const ref: SourceRef = { provider: r.provider, id: str(r.id), platform: str(r.platform), slug: r.provider === "reelshort" ? str(r.slug) : undefined, language: str(r.language) || undefined, episodeMap: map as Record<string, string>, validation: { evidence: str(body.evidence), verifiedAt: new Date().toISOString(), playbackTtlSeconds: body.playbackTtlSeconds as number | undefined } };
      result = await service.attach(miniId(str(body.id)), ref);
    } else throw new MiniError("Ação inválida.", 400);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return miniFailure(error); }
}
