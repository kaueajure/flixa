export const dynamic = "force-dynamic";

const ALLOWED_SIZES = new Set(["w342", "w780", "w1280", "original"]);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const size = searchParams.get("size") || "w342";
  const path = searchParams.get("path") || "";

  if (!ALLOWED_SIZES.has(size) || !/^\/[A-Za-z0-9._/-]+$/.test(path) || path.includes("..")) {
    return new Response("Imagem inválida", { status: 400 });
  }

  try {
    const response = await fetch(`https://image.tmdb.org/t/p/${size}${path}`, {
      headers: { Accept: "image/avif,image/webp,image/*,*/*;q=0.8" },
      cf: { cacheEverything: true, cacheTtl: 86400 },
      signal: AbortSignal.timeout(15000),
    } as RequestInit);

    if (!response.ok || !response.body) {
      return new Response("Imagem indisponível", { status: 404 });
    }

    return new Response(response.body, {
      headers: {
        "Content-Type": response.headers.get("Content-Type") || "image/jpeg",
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      },
    });
  } catch {
    return new Response("Imagem indisponível", { status: 504 });
  }
}
