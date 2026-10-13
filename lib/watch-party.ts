export type PartyProviderId = "cinesrc";
export type PartyMedia = { id: string; title: string; kind: "movie" | "tv"; season?: number; episode?: number };
export type PartyPlayback = { paused: boolean; currentTime: number; updatedAt: number; sequence: number; durationSeconds?: number };
export type PartyRoomState = { media: PartyMedia; providerId: PartyProviderId; playback: PartyPlayback };
export const PARTY_PLAYER_ORIGIN = "https://cinesrc.st";

export function partyCapabilities(roomCode: string, role: "host" | "guest") {
  const control = `watch-party:${roomCode}`;
  return {
    [control]: role === "host" ? ["history", "presence", "publish", "subscribe"] : ["history", "presence", "subscribe"],
    [`${control}:chat`]: ["history", "publish", "subscribe"],
  };
}

export function samePartyMedia(left: PartyMedia, right: PartyMedia) {
  return left.id === right.id && left.kind === right.kind && (left.kind !== "tv" || (left.season === right.season && left.episode === right.episode));
}

export function parsePartyRoomState(input: unknown): PartyRoomState | null {
  if (!input || typeof input !== "object") return null;
  const { media, playback, providerId } = input as Partial<PartyRoomState>;
  if (providerId !== "cinesrc" || !media || !playback || typeof media.id !== "string" || !media.id || media.id.length > 120 || typeof media.title !== "string" || media.title.length > 300 || (media.kind !== "movie" && media.kind !== "tv")) return null;
  if (media.kind === "tv" && (!Number.isSafeInteger(media.season) || Number(media.season) < 1 || !Number.isSafeInteger(media.episode) || Number(media.episode) < 1)) return null;
  if (typeof playback.paused !== "boolean" || !Number.isFinite(playback.currentTime) || playback.currentTime < 0 || playback.currentTime > 604800 || !Number.isFinite(playback.updatedAt) || playback.updatedAt <= 0 || !Number.isSafeInteger(playback.sequence) || playback.sequence < 0) return null;
  if (playback.durationSeconds != null && (!Number.isFinite(playback.durationSeconds) || playback.durationSeconds <= 0 || playback.durationSeconds > 604800)) return null;
  return { providerId: providerId!, media, playback };
}

export function partyTargetTime(playback: PartyPlayback, now = Date.now()) {
  const target = playback.currentTime + (playback.paused ? 0 : Math.max(0, (now - playback.updatedAt) / 1000));
  return playback.durationSeconds ? Math.min(playback.durationSeconds, target) : target;
}

export function samePartyDuration(hostDuration: number | undefined, guestDuration: number) {
  return !hostDuration || !guestDuration || Math.abs(hostDuration - guestDuration) <= 5;
}

export function cineSrcCommand(command: "play" | "pause" | "seek" | "getStatus", time?: number) {
  return { type: "cinesrc:command", command: command === "getStatus" ? "getCurrentTime" : command, args: command === "seek" ? [Math.max(0, Number(time) || 0)] : [] };
}

export function parseCineSrcEvent(input: unknown) {
  if (!input || typeof input !== "object") return null;
  const data = input as Record<string, unknown>;
  if (typeof data.type !== "string" || !data.type.startsWith("cinesrc:")) return null;
  return {
    name: data.type.slice(8).toLowerCase(),
    currentTime: typeof data.currentTime === "number" && Number.isFinite(data.currentTime) && data.currentTime >= 0 ? data.currentTime : null,
    duration: typeof data.duration === "number" && Number.isFinite(data.duration) && data.duration > 0 ? data.duration : null,
    paused: typeof data.paused === "boolean" ? data.paused : null,
    command: typeof data.command === "string" ? data.command : "",
    result: data.result,
  };
}
