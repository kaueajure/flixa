import assert from "node:assert/strict";
import test from "node:test";

import { PLAYER_SERVERS } from "../lib/player-servers.ts";
import { WATCH_PARTY_ENABLED } from "../lib/feature-flags.ts";

const curatedServerIds = [
  "pipocacine", "cdn-embed", "yapgrid", "screenscape", "xpass", "cinesrc", "unlimplay",
  "vidsrc-wiki", "videasy", "autoembed-co", "vidphantom", "embed-api", "iembed",
  "pomfy", "megaembed", "superflix", "warezcdn", "redeflix", "betterflix", "embedmovies",
];

test("keeps Assistir Junto present but disabled for use", () => {
  assert.equal(WATCH_PARTY_ENABLED, false);
});

test("keeps only policy-compatible providers under the top-20 cap", () => {
  const ids = PLAYER_SERVERS.map((server) => server.id);
  assert.deepEqual(ids, curatedServerIds);
  assert.equal(ids.length, 20);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(new Set(PLAYER_SERVERS.map((server) => server.domain)).size, ids.length);
});

test("registers usable endpoints for every declared media kind", () => {
  for (const server of PLAYER_SERVERS) {
    assert.equal(server.supportsMovie, true, `${server.id} should support movies`);
    assert.match(server.testUrl, /^https:\/\//);
    assert.equal(server.supportsTv, true, `${server.id} should support TV`);
    assert.match(server.testTvUrl, /^https:\/\//);
    assert.equal(server.protectedEmbedCompatible, true);
    assert.equal(server.blockedReason, undefined);
    assert.equal(server.audioTestUrls.length, 3);
    assert.deepEqual(server.audioTestUrls.map((sample) => sample.tmdbId), ["105", "808", "299534"]);
  }
});

test("advertises only watch-party bridges with end-to-end command proof", () => {
  const partyServers = PLAYER_SERVERS.filter((server) => server.watchPartySupport === "full");
  assert.deepEqual(partyServers.map((server) => server.id), ["xpass", "cinesrc"]);
  for (const server of partyServers) assert.match(server.compatibilityMessage, /Bridge|bridge/);
});

test("prefers Portuguese audio only where the provider supports it", () => {
  const screenscape = PLAYER_SERVERS.find((server) => server.id === "screenscape");
  assert.match(screenscape.testUrl, /[?&]lan=por(?:&|$)/);
  assert.deepEqual(
    PLAYER_SERVERS.filter((server) => server.prioritizesPortugueseAudio).map((server) => server.id),
    ["pipocacine", "cdn-embed", "screenscape", "pomfy", "megaembed", "superflix", "warezcdn", "redeflix", "betterflix", "embedmovies"],
  );

  for (const server of PLAYER_SERVERS) {
    assert.equal(Object.hasOwn(server, "audioProfile"), false, `${server.id} must not claim an unverified audio language`);
  }
});
