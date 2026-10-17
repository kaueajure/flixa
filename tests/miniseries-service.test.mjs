import assert from "node:assert/strict";
import test from "node:test";
import { MiniService } from "../lib/miniseries/service.ts";
import { MiniTransport } from "../lib/miniseries/transport.ts";
import { config, configured, sourceStatus, publicTitle } from "../lib/miniseries/policy.ts";
import { sylnTitle } from "../lib/miniseries/providers/syln.ts";
import { microTitle } from "../lib/miniseries/providers/microdramalist.ts";
import { mergeTitles } from "../lib/miniseries/normalize.ts";
import { MemoryStore, testConfig, sylnFixture, microFixture } from "./miniseries-helpers.mjs";

test("provider configuration (MOCK): credentials enable Syln without validation labels or rights JSON", () => {
  const previous = process.env.SYLN_TOKEN;
  process.env.SYLN_TOKEN = "MOCK-ONLY-TOKEN";
  try {
    const current = config();
    assert.equal(configured(current, "syln"), true);
    assert.equal(sourceStatus(current, { provider: "syln", id: "dramabox:42" }).episodesAvailable, true);
    assert.equal(sourceStatus(current, { provider: "syln", id: "dramabox:42" }).available, false);
    assert.equal("validated" in current, false); assert.equal("rights" in current, false);
  } finally { if (previous === undefined) delete process.env.SYLN_TOKEN; else process.env.SYLN_TOKEN = previous; }
  const c = testConfig(); const t = microTitle({ ...microFixture, posterUrl: "https://microdramalist.com/mock.jpg" }, true);
  assert.equal(publicTitle(c, t).poster, undefined);
  assert.equal(publicTitle(c, sylnTitle(sylnFixture)).poster, sylnFixture.poster);
  c.sylnToken = "";
  assert.equal(sourceStatus(c, { provider: "syln", id: "dramabox:42" }).available, false);
  c.enabled.syln = false;
  assert.equal(publicTitle(c, sylnTitle(sylnFixture)), null);
  assert.ok(publicTitle(c, mergeTitles(t, sylnTitle(sylnFixture))));
});
test("catalog persistence/dedup (MOCK): keeps stable ID and old aliases after later strong match", async () => {
  const store = new MemoryStore(); const service = new MiniService(store, testConfig());
  const [syln] = await service.ingest([sylnTitle(sylnFixture)]);
  const [summary] = await service.ingest([microTitle(microFixture)]);
  assert.notEqual(summary.id, syln.id); // No evidence yet: never infer from just a name.
  const [merged] = await service.ingest([microTitle(microFixture, true)]);
  assert.equal(merged.id, syln.id); assert.equal((await store.title(summary.id)).id, syln.id);
  assert.equal((await store.titles()).length, 1); assert.equal(merged.refs.length, 2);
});
test("removed provider (MOCK): ignores legacy DramaBos references without changing DramaBox or Syln", async () => {
  const store = new MemoryStore(); const c = testConfig();
  const service = new MiniService(store, c, new MiniTransport(store, async () => { throw Error("No outbound calls expected"); }));
  const title = sylnTitle(sylnFixture);
  title.refs.push({ provider: "dramabos", id: "legacy", platform: "dramabox" });
  await store.save(title);
  const detail = await service.detail(title.id);
  assert.equal(detail.title.id, title.id);
  assert.deepEqual(detail.title.refs.map((r) => r.provider), ["syln"]);
  assert.equal(detail.sources.length, 1);
  assert.equal("dramabos" in c.enabled, false);
  assert.deepEqual((await service.diagnostics()).map((p) => p.provider), ["microdramalist", "syln", "dramabox", "reelshort"]);
  await assert.rejects(service.episodes(title.id, "dramabos:dramabox:legacy"), /não corresponde/);
});
test("public catalog/search (MOCK): local matches never call paid providers; repeated identical free searches share cache", async () => {
  const store = new MemoryStore(); const calls = [];
  const transport = new MiniTransport(store, async (url) => { calls.push(url); return Response.json([microFixture]); });
  const service = new MiniService(store, testConfig(), transport);
  await service.catalog(); assert.equal(calls.length, 0);
  await service.catalog("test fixture"); await service.catalog("TEST   FIXTURE");
  assert.equal(calls.length, 1); assert.ok(calls[0].startsWith("https://microdramalist.com/api/v1/search"));
  assert.equal((await service.catalog()).titles.length, 1);
  assert.ok(!calls.some((url) => url.includes("api.syln.dev") || url.includes("dramabos.live")));
});
test("catalog refresh (MOCK ONLY): one page, no episodes/plays/per-card metadata, persists for next process", async () => {
  const store = new MemoryStore(); const calls = [];
  const fetcher = async (url) => { calls.push(url); return Response.json({ success: true, data: [sylnFixture], meta: { page: 1, limit: 24, count: 1 } }); };
  const a = new MiniService(store, testConfig(), new MiniTransport(store, fetcher));
  await a.refresh(1);
  const b = new MiniService(store, testConfig(), new MiniTransport(store, fetcher));
  await b.refresh(1); await b.catalog();
  assert.equal(calls.length, 1); assert.match(calls[0], /content_type=short_drama/);
  assert.equal((await store.titles()).length, 1);
});
test("source selection (MOCK ONLY): lazy episodes, no play until start, exact source ID and authorization checks", async () => {
  const store = new MemoryStore(); const c = testConfig(); const calls = [];
  const transport = new MiniTransport(store, async (url) => {
    calls.push(url);
    if (url.endsWith("/episodes")) return Response.json({ success: true, data: [{ ep: 1, resolutions: [480] }, { ep: 2, resolutions: [] }] });
    if (url.endsWith("/play/1")) return Response.json({ success: true, data: { ep: 1, url: "https://cdn.syln.dev/mock.mp4", expires_in: 300, subtitles: [] } });
    throw Error("unexpected MOCK request");
  });
  const service = new MiniService(store, c, transport);
  const [t] = await service.ingest([sylnTitle(sylnFixture)]);
  await service.setDistributionAuthorization(t.id, "syln:dramabox:42:en", { reference: "MOCK distribution grant for automated test only", verifiedAt: new Date().toISOString() });
  await service.detail(t.id); assert.equal(calls.length, 0);
  await assert.rejects(service.episodes(t.id, "syln:wrong"), (e) => e.status === 404);
  await assert.rejects(service.play(t.id, "syln:dramabox:42:en", "2", 1), (e) => e.status === 404);
  assert.equal(calls.length, 1);
  await Promise.all([service.play(t.id, "syln:dramabox:42:en", "1", 1), service.play(t.id, "syln:dramabox:42:en", "1", 1)]);
  assert.equal(calls.length, 2); assert.match(calls[1], /\/play\/1$/);
  assert.equal([...store.usage].find(([key]) => key.startsWith("budget:syln:"))[1].units, 105);
  assert.ok(![...store.cache.values()].some((e) => JSON.stringify(e.value).includes("mock.mp4")));
  c.playback.syln = false;
  await assert.rejects(service.play(t.id, "syln:dramabox:42:en", "1", 1), (e) => e.status === 403);
  assert.equal(calls.length, 2);
});
test("enrichment (MOCK): matching names alone cannot join different productions", async () => {
  const store = new MemoryStore(); const c = testConfig();
  const transport = new MiniTransport(store, async (url) => Response.json(url.includes("/search") ? [microFixture] : { ...microFixture, availableOn: [] }));
  const service = new MiniService(store, c, transport);
  const [t] = await service.ingest([sylnTitle(sylnFixture)]);
  await assert.rejects(service.enrich(t.id), (e) => e.status === 409);
  assert.equal((await store.titles()).length, 1);
});
test("missing credentials (MOCK): cannot activate paid catalog or return playable source", async () => {
  const c = testConfig(); c.sylnToken = "";
  const service = new MiniService(new MemoryStore(), c, new MiniTransport(new MemoryStore(), async () => { throw Error("must not call"); }));
  await assert.rejects(service.refresh(1), /credenciais/);
  assert.equal(sourceStatus(c, sylnTitle(sylnFixture).refs[0]).available, false);
});
