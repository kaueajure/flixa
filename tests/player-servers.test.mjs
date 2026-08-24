import assert from "node:assert/strict";
import test from "node:test";

import { PLAYER_SERVERS } from "../lib/player-servers.ts";

const curatedServerIds = [
  "betterflix", "megaembed", "pipocacine", "cdn-embed", "myembed",
  "vidcore", "strigil", "cinezo", "screenscape", "unlimplay",
  "vidsrc-wiki", "cinesrc", "videasy", "moviesapi", "vidzen",
  "autoembed-co", "vidphantom", "embed-api", "iembed", "mapple",
];

test("keeps a closed top 20 without mirrors or duplicate ids", () => {
  const ids = PLAYER_SERVERS.map((server) => server.id);
  assert.deepEqual(ids, curatedServerIds);
  assert.equal(ids.length, 20);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(new Set(PLAYER_SERVERS.map((server) => server.domain)).size, 20);
});

test("registers usable endpoints for every declared media kind", () => {
  for (const server of PLAYER_SERVERS) {
    assert.equal(server.supportsMovie, true, `${server.id} should support movies`);
    assert.match(server.testUrl, /^https:\/\//);
    if (server.id === "strigil") {
      assert.equal(server.supportsTv, false);
      assert.equal(server.testTvUrl, "");
    } else {
      assert.equal(server.supportsTv, true, `${server.id} should support TV`);
      assert.match(server.testTvUrl, /^https:\/\//);
    }
    assert.equal(server.protectedEmbedCompatible, true);
    assert.equal(server.blockedReason, undefined);
  }
});

test("uses only Strigil for synchronized watch parties", () => {
  const partyServers = PLAYER_SERVERS.filter((server) => server.watchPartySupport === "full");
  assert.deepEqual(partyServers.map((server) => server.id), ["strigil"]);
  assert.equal(partyServers[0].advertisingProfile, "none-declared");
});

test("prefers Portuguese audio only where the provider supports it", () => {
  const vidcore = PLAYER_SERVERS.find((server) => server.id === "vidcore");
  const screenscape = PLAYER_SERVERS.find((server) => server.id === "screenscape");
  assert.match(vidcore.testUrl, /[?&]lang=pt(?:&|$)/);
  assert.match(screenscape.testUrl, /[?&]lan=por(?:&|$)/);
  assert.deepEqual(
    PLAYER_SERVERS.filter((server) => server.prioritizesPortugueseAudio).map((server) => server.id),
    ["betterflix", "megaembed", "pipocacine", "cdn-embed", "myembed", "vidcore", "screenscape"],
  );

  for (const server of PLAYER_SERVERS) {
    assert.equal(Object.hasOwn(server, "audioProfile"), false, `${server.id} must not claim an unverified audio language`);
  }
});
