import { findProfileAvatar } from "../../../lib/profile-avatars";

export const dynamic = "force-dynamic";

const resolvedImages = new Map<string, string>();
const ALLOWED_IMAGE_HOSTS = new Set([
  "static.wikia.nocookie.net",
  "upload.wikimedia.org",
  "seeklogo.com",
  "irmaodojorel.com.br",
]);

function safeImageUrl(value: string | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && ALLOWED_IMAGE_HOSTS.has(url.hostname) ? url.toString() : null;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id") || "";
  const avatar = findProfileAvatar(id);
  if (!avatar) return new Response("Avatar não encontrado.", { status: 404 });

  const cached = resolvedImages.get(id);
  if (cached) {
    return Response.redirect(cached, 302);
  }

  const fixed = safeImageUrl(avatar.sourceUrl);
  if (fixed) {
    resolvedImages.set(id, fixed);
    return Response.redirect(fixed, 302);
  }

  if (!avatar.wikiApi || !avatar.page) return new Response("Imagem indisponível.", { status: 404 });
  try {
    const apiUrl = new URL(avatar.wikiApi);
    apiUrl.search = new URLSearchParams({
      action: "query",
      format: "json",
      origin: "*",
      prop: "pageimages",
      piprop: "thumbnail",
      pithumbsize: "512",
      redirects: "1",
      titles: avatar.page,
    }).toString();
    const response = await fetch(apiUrl, {
      headers: { "User-Agent": "Flixa profile avatars" },
      cf: { cacheTtl: 86_400, cacheEverything: true },
    } as RequestInit & { cf: { cacheTtl: number; cacheEverything: boolean } });
    if (!response.ok) return new Response("Imagem indisponível.", { status: 502 });
    const data = await response.json() as { query?: { pages?: Record<string, { thumbnail?: { source?: string } }> } };
    const page = Object.values(data.query?.pages || {})[0];
    const imageUrl = safeImageUrl(page?.thumbnail?.source);
    if (!imageUrl) return new Response("Imagem indisponível.", { status: 404 });
    resolvedImages.set(id, imageUrl);
    return Response.redirect(imageUrl, 302);
  } catch {
    return new Response("Imagem indisponível.", { status: 502 });
  }
}
