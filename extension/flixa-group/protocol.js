export const VERSION = "1.0.0";
export function validPlayback(value) {
  return value && Number.isFinite(value.currentTime) && value.currentTime >= 0 && value.currentTime <= 604800 && Number.isFinite(value.duration) && value.duration >= 600 && value.duration <= 604800 && typeof value.paused === "boolean" && value.ready >= 2 && !value.error;
}
export function descendantOf(frames, frameId, rootId) {
  const byId = new Map(frames.map(frame => [frame.frameId, frame]));
  const visited = new Set();
  while (frameId > 0 && !visited.has(frameId)) {
    if (frameId === rootId) return true;
    visited.add(frameId); frameId = byId.get(frameId)?.parentFrameId ?? -1;
  }
  return false;
}
export function normalizeCommand(command, time) {
  if (!["play", "pause", "seek", "getStatus"].includes(command)) return null;
  if (command === "seek" && (!Number.isFinite(time) || time < 0 || time > 604800)) return null;
  return { command, ...(command === "seek" ? { time } : {}) };
}
export function sitePattern(value) {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol)) throw Error("Abra o endereço do Flixa no Chrome.");
  // Chrome host match patterns exclude ports; authorization still checks the exact origin in the background.
  return `${url.protocol}//${url.hostname}/*`;
}
export function siteRegistrationId(origin) {
  return `flixa-site-${Array.from(new TextEncoder().encode(origin), byte => byte.toString(16).padStart(2, "0")).join("")}`;
}
