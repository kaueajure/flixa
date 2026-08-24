import assert from "node:assert/strict";
import test from "node:test";

import { PLAYER_SERVERS } from "../lib/player-servers.ts";

const curatedServerIds = [
  "pipocacine", "cdn-embed", "vidcore", "cinezo", "screenscape", "unlimplay",
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

test("does not advertise a watch-party bridge without end-to-end proof", () => {
  const partyServers = PLAYER_SERVERS.filter((server) => server.watchPartySupport === "full");
  assert.deepEqual(partyServers, []);
});

test("prefers Portuguese audio only where the provider supports it", () => {
  const vidcore = PLAYER_SERVERS.find((server) => server.id === "vidcore");
  const screenscape = PLAYER_SERVERS.find((server) => server.id === "screenscape");
  assert.match(vidcore.testUrl, /[?&]lang=pt(?:&|$)/);
  assert.match(screenscape.testUrl, /[?&]lan=por(?:&|$)/);
  assert.deepEqual(
    PLAYER_SERVERS.filter((server) => server.prioritizesPortugueseAudio).map((server) => server.id),
    ["pipocacine", "cdn-embed", "vidcore", "screenscape"],
  );

  for (const server of PLAYER_SERVERS) {
    assert.equal(Object.hasOwn(server, "audioProfile"), false, `${server.id} must not claim an unverified audio language`);
  }
});
