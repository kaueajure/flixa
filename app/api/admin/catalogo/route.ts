import { requireAdmin } from "../../../../db/auth";
import { GET as getMovies } from "../../movies/route";

export const dynamic = "force-dynamic";

type CatalogItem = {
  id?: unknown;
  kind?: unknown;
  tmdb_id?: unknown;
  title?: unknown;
  poster?: unknown;
  backdrop?: unknown;
  available?: unknown;
  server_count?: unknown;
};

type MediaKind = "movie" | "tv";

function forbidden() {
  return Response.json({ erro: "Acesso restrito a administradores." }, { status: 403 });
}

function validateItem(item: CatalogItem, expectedKind: MediaKind, seen: Set<string>) {
  const issues: string[] = [];
  const id = String(item.tmdb_id ?? "").trim();
  const title = String(item.title ?? "").trim();
  const poster = String(item.poster ?? "").trim();
  const backdrop = String(item.backdrop ?? "").trim();
  const key = `${expectedKind}:${id}`;

  if (item.kind !== expectedKind) issues.push("tipo incorreto");
  if (!/^[1-9]\d*$/.test(id)) issues.push("TMDB ID inválido");
  if (!title || title.length > 200) issues.push("título inválido");
  if (!/^https:\/\//i.test(poster)) issues.push("pôster ausente ou inseguro");
  if (backdrop && !/^https:\/\//i.test(backdrop)) issues.push("capa insegura");
  if (item.available !== true || !Number.isFinite(Number(item.server_count)) || Number(item.server_count) < 1) {
    issues.push("nenhum servidor habilitado compatível");
  }
  if (seen.has(key)) issues.push("duplicado");
  if (id) seen.add(key);

  return { key, title: title || String(item.id ?? "Sem título"), issues };
}

export async function POST(request: Request) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) return forbidden();

    const origin = new URL(request.url).origin;
    const responses = await Promise.all(
      (["movie", "tv"] as const).map((kind) =>
        getMovies(new Request(`${origin}/api/movies?browse=1&kind=${kind}&page=1`, {
          headers: { Accept: "application/json" },
        })),
      ),
    );

    const payloads = await Promise.all(responses.map((response) => response.json().catch(() => ({}))));
    const seen = new Set<string>();
    const problems: Array<{ key: string; title: string; issues: string[] }> = [];
    let total = 0;
    let valid = 0;

    payloads.forEach((payload, index) => {
      const expectedKind: MediaKind = index === 0 ? "movie" : "tv";
      const data = payload && typeof payload === "object" ? payload as { movies?: unknown; error?: unknown } : {};
      const movies = Array.isArray(data.movies) ? data.movies as CatalogItem[] : [];
      if (data.error || movies.length === 0) {
        problems.push({ key: expectedKind, title: expectedKind === "movie" ? "Catálogo de filmes" : "Catálogo de séries", issues: [String(data.error || "catálogo vazio")] });
      }
      movies.forEach((movie) => {
        total += 1;
        const result = validateItem(movie, expectedKind, seen);
        if (result.issues.length === 0) valid += 1;
        else if (problems.length < 20) problems.push(result);
      });
    });

    const invalid = Math.max(0, total - valid);
    return Response.json({
      status: total > 0 && invalid === 0 && problems.length === 0 ? "online" : "offline",
      tested_at: new Date().toISOString(),
      total,
      valid,
      invalid,
      problems,
      rules: [
        "TMDB ID positivo e sem duplicidade",
        "tipo filme/série consistente",
        "título e imagens HTTPS válidos",
        "ao menos um servidor compatível habilitado",
        "ao menos um provedor ativo no catálogo",
      ],
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao validar catálogo";
    return Response.json({ erro: message }, { status: 500 });
  }
}
