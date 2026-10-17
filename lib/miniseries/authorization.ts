import type { SourceRef } from "./types.ts";

export function sylnDramaBox(ref: SourceRef) {
  return ref.provider === "syln" && ref.id.startsWith("dramabox:");
}
/** Distribution evidence belongs to the persisted title/source, never to a token or .env flag. */
export function distributionAuthorized(ref: SourceRef, now = Date.now()) {
  if (!sylnDramaBox(ref) && ref.provider !== "reelshort") return true;
  const authorization = ref.distributionAuthorization;
  return !!authorization?.reference?.trim() && (!authorization.expiresAt || Date.parse(authorization.expiresAt) > now);
}
