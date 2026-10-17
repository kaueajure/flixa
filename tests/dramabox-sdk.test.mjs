import assert from 'node:assert/strict';
import test from 'node:test';
import { dramaBoxSdk } from '../lib/miniseries/providers/dramabox-sdk.ts';
import { DramaBox } from '../lib/miniseries/providers/dramabox.ts';
import { MiniTransport } from '../lib/miniseries/transport.ts';
import { MemoryStore, testConfig } from './miniseries-helpers.mjs';

// REAL installed SDK with MOCK HTTP only. These tests do not prove live access.
test('DramaBox SDK + MOCK HTTP: patches actual category fields and paging without new endpoints', async () => {
  const requests = [];
  const call = dramaBoxSdk(new MiniTransport(new MemoryStore(), async (url, init) => {
    requests.push({ url, init });
    return Response.json({ success: true, data: { types: [{ id: 698, name: 'MOCK category' }], bookList: [{ bookId: '42', bookName: 'MOCK title', chapterCount: 2, typeTwoNames: ['MOCK genre'], simpleLanguage: 'pt' }], currentPage: 1, pages: 2, total: 40 } });
  }));
  const categories = await call('getCategories', [1, 30], 'pt');
  assert.equal(categories.data[0].typeTwoId, 698); assert.equal(categories.data[0].typeTwoName, 'MOCK category');
  const books = await call('getBooksByCategory', ['698', 1, 24], 'pt');
  assert.equal(books.metadata.pages, 2); assert.equal(books.data[0].language, 'pt'); assert.deepEqual(books.data[0].tagV3s, ['MOCK genre']);
  assert.equal(requests.length, 2);
  assert.equal(new URL(requests[0].url).pathname, '/webfic/home/browse'); assert.equal(requests[0].init.method, 'POST');
});

test('DramaBox SDK + MOCK HTTP: 403 stops nested retries and pauses only the denied host', async () => {
  const requests = []; const store = new MemoryStore();
  const call = dramaBoxSdk(new MiniTransport(store, async (url) => { requests.push(new URL(url).hostname); return Response.json({}, { status: 403 }); }));
  await assert.rejects(call('getDramaList', [1, 24], 'pt'), e => e.upstreamStatus === 403);
  await assert.rejects(call('searchDrama', ['MOCK', 1, 24], 'pt'), e => e.upstreamStatus === 403);
  assert.deepEqual(requests, ['sapi.dramaboxdb.com']);
  assert.ok(store.cache.has('dramabox:access-denied:sapi.dramaboxdb.com'));
});

test('DramaBox SDK + MOCK HTTP: respects 429 Retry-After across SDK methods', async () => {
  let calls = 0; const store = new MemoryStore();
  const call = dramaBoxSdk(new MiniTransport(store, async () => { calls++; return Response.json({}, { status: 429, headers: { 'Retry-After': '120' } }); }));
  await assert.rejects(call('getCategories', [1, 30], 'pt'), e => e.status === 429);
  await assert.rejects(call('getTrending', [], 'pt'), e => e.status === 429);
  assert.equal(calls, 1); assert.ok((await store.get('cooldown:dramabox')).value > Date.now() + 118000);
});

test('DramaBox SDK + MOCK HTTP: retries transient 503 with a bounded backoff', async () => {
  let calls = 0;
  const call = dramaBoxSdk(new MiniTransport(new MemoryStore(), async () => {
    calls++; return calls < 3 ? Response.json({}, { status: 503 }) : Response.json({ data: { types: [], bookList: [] } });
  }));
  const started = Date.now();
  await call('getCategories', [1, 30], 'pt');
  assert.equal(calls, 3); assert.ok(Date.now() - started >= 2900);
});

test('DramaBox SDK + MOCK HTTP: getEpisodeDetails uses index zero and suppresses its implicit stream call', async () => {
  const requests = [];
  const c = testConfig(); c.enabled.dramabox = true;
  const store = new MemoryStore();
  const transport = new MiniTransport(store, async (url, init) => {
    requests.push(new URL(url).pathname);
    if (new URL(url).pathname.endsWith('/bootstrap')) return Response.json({ data: { user: { token: 'MOCK-NOT-A-REAL-TOKEN' } } });
    assert.equal(JSON.parse(init.body).bookId, '42');
    return Response.json({ data: { chapterCount: 1, chapterList: [{ chapterId: '900', chapterIndex: 0, chapterName: 'MOCK chapter', isCharge: 0, cdnList: [{ isDefault: 1, videoPathList: [{ isDefault: 1, videoPath: 'https://SECRET.example.test/mock.mp4' }] }] }] } });
  });
  const api = new DramaBox(transport, c);
  const ref = { provider: 'dramabox', id: '42', language: 'pt' };
  const result = await api.getEpisodeDetails(ref, '900');
  assert.equal(result.playbackIndex, 0); assert.equal(result.title, 'MOCK chapter');
  // One chapters call for the episode list, one on deliberate episode details.
  assert.equal(requests.filter(p => p.endsWith('/batch/load')).length, 2);
  assert.equal(requests.length, 3); assert.ok(!JSON.stringify([...store.cache]).includes('SECRET'));
  assert.ok(!JSON.stringify(result).includes('MOCK-NOT-A-REAL-TOKEN'));
});

test('DramaBox SDK runtime: Worker guard runs before importing or making requests', async () => {
  let calls = 0; globalThis.WebSocketPair = class {};
  try {
    const call = dramaBoxSdk(new MiniTransport(new MemoryStore(), async () => { calls++; return Response.json({}); }));
    await assert.rejects(call('getCategories', [1, 30], 'pt'), /backend Node/);
    assert.equal(calls, 0);
  } finally { delete globalThis.WebSocketPair; }
});


test('DramaBox SDK + MOCK HTTP: application failure or browse schema drift never becomes an empty success', async () => {
  for (const payload of [{ success: false, code: 403, message: 'MOCK access denied' }, { success: true, data: {} }]) {
    let calls = 0;
    const call = dramaBoxSdk(new MiniTransport(new MemoryStore(), async () => { calls++; return Response.json(payload); }));
    await assert.rejects(call('getCategories', [1, 30], 'pt'), /recusou|contrato/);
    assert.equal(calls, 1);
  }
});


test('DramaBox SDK + MOCK HTTP: missing charge flag and explicit lock do not become free episodes', async () => {
  const c = testConfig(); c.enabled.dramabox = true;
  const api = new DramaBox(new MiniTransport(new MemoryStore(), async (url) => {
    if (new URL(url).pathname.endsWith('/bootstrap')) return Response.json({ data: { user: { token: 'MOCK-ONLY-TOKEN' } } });
    return Response.json({ data: { chapterCount: 2, chapterList: [
      { chapterId: '900', chapterIndex: 0, chapterName: 'MOCK unknown charge' },
      { chapterId: '910', chapterIndex: 1, chapterName: 'MOCK explicit lock', isCharge: 0, isLocked: 1 },
    ] } });
  }), c);
  const episodes = await api.getChapters({ provider: 'dramabox', id: '42', language: 'pt' });
  assert.deepEqual(episodes.map(e => e.available), [false, false]);
});
