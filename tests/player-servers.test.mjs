import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import { PLAYER_SERVERS } from "../lib/player-servers.ts";
import { WATCH_PARTY_ENABLED } from "../lib/feature-flags.ts";

const curatedServerIds = [
  "pipocacine", "myembed", "cdn-embed", "pomfy", "betterflix", "filmesyseries",
  "vidsrc-wiki", "cinesrc", "moviesapi", "vidzen", "videasy", "yapgrid",
  "vidbolt", "embos", "unlimplay", "screenscape", "nsrplay", "filesun",
  "vidphantom-live", "vidphantom-online", "vidphantom-site", "vidphantom-website",
  "vidphantom-xyz", "2embed-skin", "2embed-cc", "nontongo", "primesrc", "vidlux", "cinezo",
  "vidlux-top", "vidlux-quilox", "vidlux-spider", "vidlux-magic", "vidlux-dubai",
  "vidlux-astra", "vidlux-vidrock", "primesrc-primevid", "primesrc-voe",
  "primesrc-dood", "autoembed-co", "vidphantom", "vidcore", "embed-api",
  "iembed", "mapple",
];

test("keeps Assistir Junto present but disabled for use", () => {
  assert.equal(WATCH_PARTY_ENABLED, false);
  const pageSource = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  const controlsSource = readFileSync(new URL("../app/watch-party-controls.tsx", import.meta.url), "utf8");
  const ticketSource = readFileSync(new URL("../app/api/watch-party/ticket/route.ts", import.meta.url), "utf8");
  assert.match(pageSource, /Assistir em grupo está temporariamente indisponível/);
  assert.match(pageSource, /if \(!WATCH_PARTY_ENABLED\)/);
  assert.match(controlsSource, /watch-party-trigger is-disabled[\s\S]*disabled/);
  assert.match(ticketSource, /status: 503/);
});

test("keeps the curated 45-provider inventory", () => {
  const ids = PLAYER_SERVERS.map((server) => server.id);
  const pageSource = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.deepEqual(ids, curatedServerIds);
  assert.equal(ids.length, 45);
  assert.equal(new Set(ids).size, ids.length);
  assert.match(pageSource, /return PLAYER_SERVERS\s*\.filter/);
});

test("registers usable endpoints for every declared media kind", () => {
  for (const server of PLAYER_SERVERS) {
    if (server.supportsMovie) assert.match(server.testUrl, /^https:\/\//);
    if (server.supportsTv) assert.match(server.testTvUrl, /^https:\/\//);
    assert.equal(server.protectedEmbedCompatible, true);
    assert.equal(server.audioTestUrls.length, 3);
    assert.deepEqual(server.audioTestUrls.map((sample) => sample.tmdbId), ["105", "808", "299534"]);
  }
});

test("advertises only watch-party bridges with end-to-end command proof", () => {
  const partyServers = PLAYER_SERVERS.filter((server) => server.watchPartySupport === "full");
  assert.deepEqual(partyServers.map((server) => server.id), []);
  for (const server of partyServers) assert.match(server.compatibilityMessage, /Bridge|bridge/);
});

test("prefers Portuguese audio only where the provider supports it", () => {
  assert.deepEqual(
    PLAYER_SERVERS.filter((server) => server.prioritizesPortugueseAudio).map((server) => server.id),
    ["pipocacine", "myembed", "cdn-embed", "pomfy", "betterflix", "filmesyseries"],
  );

  for (const server of PLAYER_SERVERS) {
    assert.equal(Object.hasOwn(server, "audioProfile"), false, `${server.id} must not claim an unverified audio language`);
  }
});
