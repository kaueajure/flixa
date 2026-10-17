import assert from "node:assert/strict";
import test from "node:test";
import { DramaBox, dramaBoxTitle, dramaBoxEpisodes, dramaBoxPlayback, DRAMABOX_CAPABILITIES, officialDramaBoxUrl, withDramaBoxReferences } from "../lib/miniseries/providers/dramabox.ts";
import { microTitle } from "../lib/miniseries/providers/microdramalist.ts";
import { sylnTitle } from "../lib/miniseries/providers/syln.ts";
import { MiniService } from "../lib/miniseries/service.ts";
import { MiniTransport, providerBudget } from "../lib/miniseries/transport.ts";
import { configured, sourceStatus } from "../lib/miniseries/policy.ts";
import { MemoryStore, testConfig, microFixture, sylnFixture } from "./miniseries-helpers.mjs";

// MOCK metadata only. No SDK responses or mock streams are presented as real validation.
function title(lang = "PORTUGUESE") {
  return microTitle({ ...microFixture, languages: [lang], availableOn: [{ platform: "DramaBox", externalId: "42", url: "https://www.dramabox.com/pt/drama/42/TEST-FIXTURE", language: lang, unverified: false }] }, true);
}

test("DramaBox association (MOCK): uses verified IDs and official links, retains metadata provenance", () => {
  const t = withDramaBoxReferences(title()); const r = t.refs.find((s) => s.provider === "dramabox");
  assert.equal(r.id, "42"); assert.equal(r.language, "pt"); assert.equal(r.metadataRef, "mdid-test42");
  assert.equal(t.metadataProvider, "microdramalist"); assert.deepEqual(t.metadataProviders, ["microdramalist"]);
  assert.equal(withDramaBoxReferences(t).refs.length, t.refs.length);
  assert.equal(sourceStatus(testConfig(), r).available, false);
  assert.equal(sourceStatus(testConfig(), r).name, "DramaBox · pt");
});

test("DramaBox links (MOCK): rejects mismatched IDs, unverified availability, CDN and lookalike domains", () => {
  const t = title();
  for (const url of ["http://www.dramabox.com/drama/42", "https://www.dramabox.com.evil.example/drama/42", "https://www.dramabox.com@evil.example/drama/42", "https://image.dramaboxdb.com/cover/42.jpg", "https://www.dramabox.com/drama/420/other", "https://www.dramabox.com/", "https://www.dramabox.com:444/drama/42"]) {
    assert.equal(officialDramaBoxUrl(url, "42"), undefined);
    assert.equal(withDramaBoxReferences({ ...t, originals: [{ ...t.originals[0], url }] }).refs.some((r) => r.provider === "dramabox"), false);
  }
  assert.equal(withDramaBoxReferences({ ...t, originals: [{ ...t.originals[0], verified: false }] }).refs.length, 1);
  assert.equal(withDramaBoxReferences({ ...t, externalIds: {} }).refs.length, 1);
});

test("DramaBox deduplication (MOCK): joins the existing MicroDramaList/Syln card without inventing a title", async () => {
  const store = new MemoryStore(); const c = testConfig(); c.enabled.dramabox = true; const service = new MiniService(store, c);
  const [initial] = await service.ingest([sylnTitle(sylnFixture)]);
  const [merged] = await service.ingest([title()]);
  assert.equal(merged.id, initial.id); assert.equal((await store.titles()).length, 1);
  assert.deepEqual(new Set(merged.refs.map((r) => r.provider)), new Set(["syln", "microdramalist", "dramabox"]));
});

test("DramaBox association (MOCK): revoked/unverified links remove derived references without touching other providers", async () => {
  const store = new MemoryStore(); const c = testConfig(); c.enabled.dramabox = true; const service = new MiniService(store, c);
  const [original] = await service.ingest([title()]);
  assert.ok(original.refs.some((r) => r.provider === "dramabox"));
  const [updated] = await service.ingest([{ ...title(), originals: [] }]);
  assert.equal(updated.id, original.id); assert.equal(updated.refs.some((r) => r.provider === "dramabox"), false);
  assert.ok(updated.refs.some((r) => r.provider === "microdramalist"));
  service.config.enabled.dramabox = false;
  assert.deepEqual((await service.catalog()).originalPlatforms, []);
  await assert.rejects(service.syncDramaBox(), (e) => e.status === 403);
});

// All SDK payloads below are explicitly TEST DOUBLES, not live validation.
const book = { bookId: '42', bookName: 'MOCK PT title', introduction: 'MOCK synopsis', coverWap: 'https://images.example.test/mock.webp', chapterCount: 2, tagV3s: [{ tagName: 'MOCK genre' }], playCount: 20 };
const ok = data => ({ success: true, data });
const chapters = ok({ bookId: '42', totalChapters: 2, chapters: [
  { chapterId: '900', chapterIndex: 0, chapterIndexStr: '1', chapterName: 'MOCK first', isCharge: false, isLocked: false, videoPath: 'https://SECRET.example.test/do-not-store.mp4', cdnList: ['SECRET'] },
  { chapterId: '910', chapterIndex: 3, chapterIndexStr: '4', chapterName: 'MOCK locked', isCharge: true, isLocked: true },
] });
const ref = { provider: 'dramabox', platform: 'dramabox', id: '42', language: 'pt' };
function configuration() { const c = testConfig(); c.enabled.dramabox = true; c.playback.dramabox = true; c.dramaBoxMediaHosts = ["media.example.test"]; return c; }
function adapter(call, c = configuration(), store = new MemoryStore(), fetcher = async () => new Response(null)) {
  return { api: new DramaBox(new MiniTransport(store, fetcher), c, call), store, c };
}

test('DramaBox SDK (MOCK): maps documented fields and keeps external identity', () => {
  const t = dramaBoxTitle(book);
  assert.equal(t.id, ''); assert.equal(t.externalIds['platform:dramabox'], '42');
  assert.equal(t.title, book.bookName); assert.equal(t.poster, book.coverWap); assert.equal(t.episodeCount, 2);
  assert.deepEqual(t.genres, ['MOCK genre']); assert.equal(t.views, 20); assert.equal(t.metadataLanguage, 'pt');
  assert.deepEqual(t.languages, []); // Request locale does not prove audio language.
  assert.throws(() => dramaBoxTitle({ ...book, bookId: undefined }), /identificador/);
  assert.throws(() => dramaBoxTitle({ ...book, bookId: '42', bookName: undefined }), /título/);
});

test('DramaBox SDK (MOCK): all catalog shapes, pagination and categories use actual method names', async () => {
  const seen = [];
  const { api } = adapter(async (method, args) => {
    seen.push([method, args]);
    if (method === 'getDramaList' || method === 'searchDrama') return ok({ isMore: true, book: [{ ...book, id: book.bookId, name: book.bookName }] });
    if (method === 'getLatest' || method === 'getTrending') return ok({ results: [book] });
    if (method === 'getCategories') return ok([{ typeTwoId: 698, typeTwoName: 'MOCK category', count: 12 }]);
    return ok([book]);
  });
  assert.equal((await api.getDramaList(2, 24)).hasMore, true);
  assert.equal((await api.searchDrama(' MOCK  Title ')).titles.length, 1);
  await api.getLatest(); await api.getRecommendedBooks(); await api.getTrending();
  assert.deepEqual(await api.getCategories(), [{ id: '698', name: 'MOCK category', count: 12 }]);
  assert.ok((await api.getBooksByCategory('698')).titles[0].genres.includes('MOCK category'));
  assert.deepEqual(seen.map(([m]) => m), ['getDramaList', 'searchDrama', 'getLatest', 'getRecommendedBooks', 'getTrending', 'getCategories', 'getBooksByCategory']);
  assert.deepEqual(seen[1][1], ['mock title', 1, 24]);
});

test('DramaBox SDK (MOCK): MySQL contract cache coalesces across visits and adapter instances', async () => {
  let count = 0; const store = new MemoryStore();
  const call = async () => { count++; return ok({ isMore: false, book: [book] }); };
  const { api } = adapter(call, configuration(), store);
  await Promise.all([api.getDramaList(), api.getDramaList(), api.getDramaList()]);
  await adapter(call, configuration(), store).api.getDramaList();
  assert.equal(count, 1);
  const saved = [...store.cache.values()].find(r => r.value?.titles)?.value;
  assert.equal(saved.titles[0].externalIds['platform:dramabox'], '42');
});

test('DramaBox SDK (MOCK): English fallback only for a successful empty PT result', async () => {
  const locales = [];
  const { api } = adapter(async (method, args, lang) => { locales.push(lang); return ok({ isMore: false, book: lang === 'pt' ? [] : [book] }); });
  assert.equal((await api.getDramaList()).titles[0].metadataLanguage, 'en');
  assert.deepEqual(locales, ['pt', 'en']);
  let calls = 0;
  const failing = adapter(async () => { calls++; throw Object.assign(new Error('HTTP 403'), { status: 502 }); }).api;
  await assert.rejects(failing.getDramaList()); await assert.rejects(failing.getDramaList());
  assert.equal(calls, 1); // Negative cache; never retry via another language.
});

test('DramaBox SDK (MOCK): title detail preserves PT and fills only missing synopsis from EN', async () => {
  const { api } = adapter(async (_, __, lang) => ok({ detail: { ...book, bookName: lang === 'pt' ? 'MOCK PT' : 'MOCK EN', introduction: lang === 'pt' ? '' : 'MOCK EN description' } }));
  const detail = await api.getDramaDetail('42');
  assert.equal(detail.title, 'MOCK PT'); assert.equal(detail.synopsis, 'MOCK EN description');
  assert.deepEqual(detail.alternativeTitles, ['MOCK EN']); assert.equal(detail.detailComplete, true);
});

test('DramaBox chapters (MOCK): maps real ID, display number and selector separately; strips media', async () => {
  const episodes = dramaBoxEpisodes(chapters, ref);
  assert.deepEqual(episodes.map(e => [e.id, e.number, e.playbackIndex, e.available]), [['900', 1, 0, true], ['910', 4, 3, false]]);
  assert.ok(!JSON.stringify(episodes).includes('SECRET'));
  assert.equal(dramaBoxEpisodes(ok({ bookId: '42', chapters: [{ ...chapters.data.chapters[0], isLocked: undefined }] }), ref)[0].available, false);
  assert.throws(() => dramaBoxEpisodes(ok({ bookId: '43', chapters: [] }), ref), /inconsistente/);
  assert.throws(() => dramaBoxEpisodes(ok({ bookId: '42', chapters: [chapters.data.chapters[0], chapters.data.chapters[0]] }), ref), /duplicado/);
  const { api, store } = adapter(async () => chapters);
  await api.getChapters(ref);
  assert.ok(!JSON.stringify([...store.cache]).includes('SECRET'));
  assert.equal((await api.getChapters({ ...ref, episodeMap: { sharedKey: '900' } }))[0].key, 'sharedKey');
});

test('DramaBox episode details (MOCK): preserves zero index and never persists nested stream fields', async () => {
  const calls = [];
  const { api, store } = adapter(async (method, args, locale, play) => {
    calls.push([method, args, play]);
    if (method === 'getChapters') return chapters;
    return ok({ bookId: '42', episode: { index: 0, name: 'MOCK detail', videoPath: 'SECRET', stream: { url: 'SECRET' } } });
  });
  const result = await api.getEpisodeDetails(ref, '900');
  assert.equal(result.title, 'MOCK detail'); assert.equal(result.playbackIndex, 0);
  assert.deepEqual(calls[1], ['getEpisodeDetails', ['42', 0], undefined]);
  assert.ok(!JSON.stringify([...store.cache]).includes('SECRET'));
});

test('DramaBox configuration (MOCK): disabled provider stays offline, episodes independent of playback', async () => {
  const c = testConfig(); let calls = 0;
  const { api } = adapter(async () => { calls++; return chapters; }, c);
  await assert.rejects(api.getChapters(ref), e => e.status === 403); assert.equal(calls, 0);
  c.enabled.dramabox = true;
  assert.equal(configured(c, 'dramabox'), true); assert.equal(sourceStatus(c, ref).episodesAvailable, true);
  assert.equal(sourceStatus(c, ref).available, false);
  await api.getChapters(ref); await assert.rejects(api.play(ref, '900'), e => e.status === 403);
  assert.equal(calls, 1);
});

function stream(url, id = '900', index = 0) { return ok({ status: 'success', data: { bookId: '42', chapter: { id, index, video: { mp4: url, m3u8: null } } } }); }
test('DramaBox MP4 (MOCK): rejects expired/unknown validity, wrong chapter, unvalidated hosts', () => {
  const episode = dramaBoxEpisodes(chapters, ref)[0]; const now = Date.now();
  const url = `https://media.example.test/mock.mp4?Expires=${Math.floor(now / 1000) + 120}`;
  const playback = dramaBoxPlayback(stream(url), ref, episode, ['media.example.test'], now);
  assert.equal(playback.url, url); assert.ok(playback.expiresAt > now);
  for (const bad of ['https://media.example.test/mock.mp4', 'https://media.example.test/mock.mp4?exp=1', url.replace('media.example.test', 'evil.example.test')]) assert.throws(() => dramaBoxPlayback(stream(bad), ref, episode, ['media.example.test'], now));
  assert.throws(() => dramaBoxPlayback(stream(url, '910', 3), ref, episode, ['media.example.test'], now), /outro episódio/);
});

test('DramaBox Play (MOCK): lazy MP4 fetch, HEAD validation, locked episodes blocked, no permanent media cache', async () => {
  {
    const calls = []; const probes = [];
    const { api, store } = adapter(async (method, args, locale, play) => { calls.push([method, args, play]); return method === 'getChapters' ? chapters : stream(`https://media.example.test/mock.mp4?Expires=${Math.floor(Date.now()/1000)+120}`); }, configuration(), new MemoryStore(), async (url, init) => { probes.push([url, init.method]); return new Response(null); });
    await api.getChapters(ref); assert.equal(calls.length, 1); assert.equal(probes.length, 0);
    await assert.rejects(api.play(ref, '910'), e => e.status === 403); assert.equal(calls.length, 1);
    const playback = await api.play(ref, '900'); assert.ok(playback.url.includes('.mp4'));
    assert.deepEqual(calls[1], ['getStreamUrl', ['42', 0], true]); assert.equal(probes[0][1], 'HEAD');
    assert.ok(!JSON.stringify([...store.cache]).includes('mock.mp4'));
  }
});

test('DramaBox publication (MOCK): imports once, deduplicates with MicroDramaList/Syln and keeps internal ID', async () => {
  const store = new MemoryStore(); const c = configuration(); const service = new MiniService(store, c); let calls = 0;
  service.dramaBox.call = async () => { calls++; return ok({ isMore: false, book: [book] }); };
  const [initial] = await service.ingest([sylnTitle(sylnFixture), title()]);
  assert.equal((await service.refresh(1, 'dramabox')).imported, 1);
  assert.equal((await service.catalog()).titles.length, 1); await service.catalog();
  const all = await store.titles(); assert.equal(all.length, 1); assert.equal(all[0].id, initial.id);
  assert.equal(all[0].metadataProvider, 'microdramalist'); assert.equal(calls, 1);
  assert.equal(DRAMABOX_CAPABILITIES.sdk.enabled, true); assert.equal(providerBudget('dramabox').limit, 15);
});


test('DramaBox search pagination (MOCK): reuses indexed pages, retains relevance and ASCII cache keys', async () => {
  const c = configuration(); c.enabled.microdramalist = false; c.enabled.syln = false;
  const store = new MemoryStore(); const service = new MiniService(store, c); const calls = [];
  service.dramaBox.call = async (method, args) => {
    calls.push([method, args]);
    return ok({ isMore: args[1] === 1, book: [{ ...book, bookId: args[1] === 1 ? '42' : '43', bookName: 'MOCK relevant result without literal query' }] });
  };
  const first = await service.catalog('coração'); assert.equal(first.hasMore, true);
  assert.equal((await service.catalog('coração')).titles[0].id, first.titles[0].id);
  const second = await service.catalog('coração', 2); assert.equal(second.titles.length, 1); assert.equal(second.hasMore, false);
  await service.catalog('coração', 2); assert.equal(calls.length, 2);
  assert.ok([...store.cache.keys()].every(k => /^[\x00-\x7f]+$/.test(k) && k.length <= 190));
});
