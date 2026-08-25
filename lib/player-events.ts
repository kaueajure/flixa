export type PlayerPlaybackEvent = {
  state?: "playing" | "paused" | "ended";
  positionSeconds?: number;
  durationSeconds?: number;
};

function finite(value: unknown) {
  const number = typeof value === "string" ? Number(value) : value;
  return typeof number === "number" && Number.isFinite(number) && number >= 0 ? number : undefined;
}

/** Normaliza bridges conhecidos sem confiar em mensagens de origens não verificadas. */
export function parsePlayerPlaybackEvent(input: unknown): PlayerPlaybackEvent | null {
  let data = input;
  if (typeof data === "string") {
    try { data = JSON.parse(data); } catch { data = { type: data }; }
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const record = data as Record<string, unknown>;
  const nested = record.data && typeof record.data === "object" && !Array.isArray(record.data) ? record.data as Record<string, unknown> : record;
  const signal = String(record.type || record.event || record.action || record.status || nested.type || nested.event || "").toLowerCase().replaceAll("_", "-");
  if (/error|fatal|failed|not-found/.test(signal)) return null;
  const state = /(?:^|-)ended$|complete|finished/.test(signal) ? "ended" : /pause/.test(signal) ? "paused" : /play|playing|time-update|timeupdate|progress/.test(signal) ? "playing" : undefined;
  const positionSeconds = finite(nested.currentTime ?? nested.current_time ?? nested.position ?? nested.time ?? record.currentTime ?? record.position);
  const durationSeconds = finite(nested.duration ?? nested.totalDuration ?? nested.total_duration ?? record.duration);
  const percent = finite(nested.percent ?? nested.percentage ?? nested.progress ?? record.progress);
  const resolvedPosition = positionSeconds ?? (percent != null && durationSeconds ? durationSeconds * (percent > 1 ? percent / 100 : percent) : undefined);
  if (!state && resolvedPosition == null && durationSeconds == null) return null;
  return { state, positionSeconds: resolvedPosition, durationSeconds };
}
