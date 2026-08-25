import assert from "node:assert/strict";
import test from "node:test";
import { parsePlayerPlaybackEvent } from "../lib/player-events.ts";

test("normaliza play, pausa e tempo real enviados por bridges de player", () => {
  assert.deepEqual(parsePlayerPlaybackEvent({ event: "time_update", data: { currentTime: 90, duration: 900 } }), {
    state: "playing", positionSeconds: 90, durationSeconds: 900,
  });
  assert.equal(parsePlayerPlaybackEvent({ type: "pause", position: 120 })?.state, "paused");
});

test("considera encerramento um evento explícito e rejeita mensagens irrelevantes", () => {
  assert.equal(parsePlayerPlaybackEvent(JSON.stringify({ type: "ended", currentTime: 900, duration: 900 }))?.state, "ended");
  assert.equal(parsePlayerPlaybackEvent({ hello: "world" }), null);
  assert.equal(parsePlayerPlaybackEvent({ type: "playback-error" }), null);
});
