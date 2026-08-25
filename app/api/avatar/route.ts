import { findProfileAvatar } from "../../../lib/profile-avatars";

export function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id") || "";
  const avatar = findProfileAvatar(id);

  if (!avatar) {
    return new Response("Avatar não encontrado.", { status: 404 });
  }

  return Response.redirect(new URL(avatar.file, request.url), 302);
}
