import assert from "node:assert/strict";
import test from "node:test";
import { microTitle } from "../lib/miniseries/providers/microdramalist.ts";
import { sylnTitle, sylnEpisodes, sylnPlayback } from "../lib/miniseries/providers/syln.ts";
import { mergeTitles, sameProduction, https } from "../lib/miniseries/normalize.ts";
import { sourceKey, episodeKey } from "../lib/miniseries/types.ts";
import { microFixture, sylnFixture } from "./miniseries-helpers.mjs";

test("normalization (MOCK): preserves opaque IDs, unknown fields and source language", () => {
  const a = microTitle(microFixture, true), b = sylnTitle(sylnFixture);
  assert.equal(a.year, undefined); assert.equal(a.poster, undefined);
  assert.deepEqual(a.languages, ["en"]); assert.deepEqual(b.languages, ["en"]);
  assert.equal(a.externalIds["platform:dramabox"], "42"); assert.equal(sameProduction(a, b), true);
  assert.throws(() => sylnTitle({ ...sylnFixture, content_type: "movie" }));
  assert.throws(() => sylnTitle({ ...sylnFixture, platform: "other" }));
  assert.equal(https("https://user:password@example.com"), undefined);
  assert.equal(https("javascript:alert(1)"), undefined);
  assert.equal(microTitle({ ...microFixture, availableOn: [{ ...microFixture.availableOn[0], unverified: true }] }, true).originals[0].verified, false);
  assert.deepEqual(microTitle({ ...microFixture, availableOn: [{ ...microFixture.availableOn[0], unverified: true }] }, true).externalIds, {});
});
test("deduplication (MOCK): never merges on similar titles, conflicts veto strong matches", () => {
  const a = sylnTitle(sylnFixture); const b = microTitle(microFixture, true);
  assert.equal(sameProduction(a, { ...b, externalIds: {}, languages: [] }), false);
  assert.equal(sameProduction(a, { ...b, externalIds: { "platform:dramabox": "43" } }), false);
  assert.equal(sameProduction({ ...a, year: 2025 }, { ...b, externalIds: {}, year: 2025 }), true);
  assert.equal(sameProduction({ ...a, year: 2025 }, { ...b, externalIds: {}, year: 2024 }), false);
  assert.equal(sameProduction({ ...a, year: 2025 }, { ...b, externalIds: {}, year: 2025, languages: ["pt"] }), false);
  assert.equal(sameProduction({ ...a, year: 2025 }, { ...b, externalIds: {}, year: 2025, episodeCount: 3 }), false);
  const merged = mergeTitles({ ...a, id: "stable" }, b);
  assert.equal(merged.id, "stable"); assert.equal(merged.metadataProvider, "microdramalist"); assert.equal(merged.refs.length, 2);
  assert.equal(merged.synopsis, microFixture.description);
  const unverified = microTitle({ ...microFixture, availableOn: [{ ...microFixture.availableOn[0], unverified: true }] }, true);
  assert.equal(mergeTitles(merged, unverified).originals[0].verified, false);
  assert.deepEqual(mergeTitles(merged, microTitle({ ...microFixture, availableOn: [] }, true)).originals, []);
});
test("episode mapping (MOCK): different source selectors need explicit logical correspondence", () => {
  const a = { provider: "syln", id: "dramabox:42", episodeMap: { chapter1: "1" } };
  const b = { provider: "dramabox", id: "77", platform: "dramabox", episodeMap: { chapter1: "8" } };
  assert.equal(episodeKey(a, "1"), episodeKey(b, "8"));
  assert.notEqual(episodeKey({ ...a, episodeMap: undefined }, "1"), episodeKey({ ...b, episodeMap: undefined }, "1"));
  const episodes = sylnEpisodes({ success: true, data: [{ ep: 1, resolutions: [480] }, { ep: 2, resolutions: [] }] }, a);
  assert.equal(episodes[0].key, "chapter1"); assert.equal(episodes[1].available, false);
  assert.throws(() => sylnEpisodes({ success: true, data: [{ ep: 1, resolutions: [] }, { ep: 1, resolutions: [] }] }, a));
  assert.match(sourceKey({ ...a, language: "pt" }), /:pt$/);
  assert.notEqual(sourceKey(a), sourceKey(b));
});
test("playback parser (MOCK): rejects wrong episode, unsafe URLs and expired signatures", () => {
  const r = { success: true, data: { ep: 1, url: `https://cdn.syln.dev/mock.mp4?t=${Math.floor(Date.now() / 1000) + 300}&s=MOCK`, expires_in: 300, subtitles: [] } };
  assert.ok(sylnPlayback(r, "1").expiresAt < Date.now() + 300000);
  assert.throws(() => sylnPlayback(r, "2"));
  assert.throws(() => sylnPlayback({ ...r, data: { ...r.data, url: "https://evil.example/video" } }, "1"));
  assert.throws(() => sylnPlayback({ ...r, data: { ...r.data, url: "https://cdn.syln.dev/mock.mp4?t=1" } }, "1"));
});
