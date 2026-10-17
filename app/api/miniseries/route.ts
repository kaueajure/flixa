import { requireUsuario } from "../../../db/auth";
import { miniFailure, miniId, miniService } from "../../../lib/miniseries/server";
import { MiniError } from "../../../lib/miniseries/types";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const u = new URL(request.url); const id = u.searchParams.get("id");
    const q = u.searchParams.get("q") || ""; const page = Number(u.searchParams.get("page") || 1);
    if (q.length > 100 || !Number.isSafeInteger(page) || page < 1 || page > 210) throw new MiniError("Busca ou página inválida.", 400);
    if (id) miniId(id);
    const user = await requireUsuario(request);
    if (!user) throw new MiniError("Entre para acessar Minisséries.", 401);
    const service = miniService();
    if (q.trim().length >= 3 && !await service.store.reserve(`usersearch:${user.id}`, 1, 30, 60000)) throw new MiniError("Aguarde antes de pesquisar novamente.", 429);
    const platform = u.searchParams.get("platform") || undefined;
    if (platform && platform !== "dramabox") throw new MiniError("Plataforma inválida.", 400);
    const category = u.searchParams.get("category") || undefined;
    if (category && (!/^\d{1,32}$/.test(category) || q || platform)) throw new MiniError("Categoria inválida.", 400);
    const supplier = u.searchParams.get("provider");
    if (supplier && supplier !== "reelshort") throw new MiniError("Fornecedor inválido.", 400);
    if (supplier && (id || category || platform)) throw new MiniError("Combinação de filtros inválida.", 400);
    const payload = supplier === "reelshort" ? await service.externalCatalog(supplier, u.searchParams.get("source") || "reelshort", q, page) : id ? await service.detail(id) : u.searchParams.get("categories") === "dramabox" ? { categories: await service.categories() } : await service.catalog(q, page, category, platform === "dramabox" ? "dramabox" : undefined);
    return Response.json(payload, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return miniFailure(error); }
}
