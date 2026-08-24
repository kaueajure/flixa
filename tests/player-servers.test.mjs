import assert from "node:assert/strict";
import test from "node:test";

import { PLAYER_SERVERS } from "../lib/player-servers.ts";

const additionalServerIds = [
  "vidbolt", "embos", "unlimplay", "screenscape", "nsrplay", "filesun",
  "vidphantom-live", "vidphantom-online", "vidphantom-site", "vidphantom-website",
  "vidphantom-xyz", "apiplayer", "vidsrc-cc", "2embed-skin", "2embed-cc",
  "nontongo", "primesrc", "vidlux", "cinezo", "vidzee",
];

const sandboxReplacementIds = [
  "2embed-skin", "2embed-cc", "nontongo", "primesrc", "vidlux", "cinezo", "vidzee",
  "2embed-stream", "vidlux-top", "vidlux-quilox", "vidlux-spider", "vidlux-magic",
  "vidlux-dubai", "vidlux-astra", "vidlux-vidrock", "primesrc-primevid", "primesrc-voe",
  "primesrc-dood",
];

test("registers 20 additional movie and TV endpoints without duplicate ids", () => {
  const ids = PLAYER_SERVERS.map((server) => server.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(additionalServerIds.length, 20);

  for (const id of additionalServerIds) {
    const server = PLAYER_SERVERS.find((candidate) => candidate.id === id);
    assert.ok(server, `${id} should be registered`);
    assert.equal(server.supportsMovie, true);
    assert.equal(server.supportsTv, true);
    assert.match(server.testUrl, /^https:\/\//);
    assert.match(server.testTvUrl, /^https:\/\//);
  }
});

test("does not attach provider-wide audio labels", () => {
  for (const server of PLAYER_SERVERS) {
    assert.equal(Object.hasOwn(server, "audioProfile"), false, `${server.id} must not claim an audio language`);
  }
});

test("keeps 56 servers while replacing every sandbox-incompatible entry one-for-one", () => {
  assert.equal(PLAYER_SERVERS.length, 56);
  assert.equal(sandboxReplacementIds.length, 18);
  assert.equal(PLAYER_SERVERS.every((server) => server.protectedEmbedCompatible), true);

  for (const id of sandboxReplacementIds) {
    const server = PLAYER_SERVERS.find((candidate) => candidate.id === id);
    assert.ok(server, `${id} should replace a sandbox-incompatible server`);
    assert.equal(server.supportsMovie, true);
    assert.equal(server.supportsTv, true);
  }
});
