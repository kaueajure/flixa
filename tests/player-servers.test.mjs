import assert from "node:assert/strict";
import test from "node:test";

import { PLAYER_SERVERS } from "../lib/player-servers.ts";

const curatedServerIds = [
  "pipocacine", "cdn-embed", "cinezo", "screenscape", "xpass", "cinesrc", "moviesapi", "unlimplay",
  "vidsrc-wiki", "videasy", "autoembed-co", "vidphantom", "embed-api", "iembed",
];

test("keeps only policy-compatible providers under the top-20 cap", () => {
  const ids = PLAYER_SERVERS.map((server) => server.id);
  assert.deepEqual(ids, curatedServerIds);
  assert.ok(ids.length <= 20);
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
  }
});

test("advertises only watch-party bridges with end-to-end command proof", () => {
  const partyServers = PLAYER_SERVERS.filter((server) => server.watchPartySupport === "full");
  assert.deepEqual(partyServers.map((server) => server.id), ["xpass", "cinesrc", "moviesapi"]);
  for (const server of partyServers) assert.match(server.compatibilityMessage, /Bridge|bridge/);
});

test("prefers Portuguese audio only where the provider supports it", () => {
  const xpass = PLAYER_SERVERS.find((server) => server.id === "xpass");
  const screenscape = PLAYER_SERVERS.find((server) => server.id === "screenscape");
  assert.match(xpass.compatibilityMessage, /Portuguese/);
  assert.match(screenscape.testUrl, /[?&]lan=por(?:&|$)/);
  assert.deepEqual(
    PLAYER_SERVERS.filter((server) => server.prioritizesPortugueseAudio).map((server) => server.id),
    ["pipocacine", "cdn-embed", "screenscape", "xpass"],
  );

  for (const server of PLAYER_SERVERS) {
    assert.equal(Object.hasOwn(server, "audioProfile"), false, `${server.id} must not claim an unverified audio language`);
  }
});
