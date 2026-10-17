// Real SDK + real MySQL control plane. No fixtures, tokens or media URLs in reports.
import { config as loadEnv } from 'dotenv';
import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
loadEnv({ path: '.env.local', quiet: true }); loadEnv({ path: '.env', quiet: true });
await mkdir('tmp', { recursive: true });
const entry = resolve('tmp/dramabox-smoke-runtime.mjs');
await build({ stdin: { contents: 'export { miniStore } from "./db/miniseries.ts"; export { DramaBox } from "./lib/miniseries/providers/dramabox.ts"; export { MiniTransport } from "./lib/miniseries/transport.ts"; export { config } from "./lib/miniseries/policy.ts";', resolveDir: process.cwd() }, outfile: entry, platform: 'node', bundle: true, format: 'esm', packages: 'external' });
const { miniStore, DramaBox, MiniTransport, config } = await import(pathToFileURL(entry).href);
const requests = []; const operations = [];
const transport = new MiniTransport(miniStore, async (address, init) => {
  const u = new URL(address);
  const item = { method: init?.method || 'GET', host: u.hostname, path: u.pathname, status: null };
  requests.push(item);
  try { const response = await fetch(address, init); item.status = response.status;
    if (u.hostname === 'www.webfic.com' && response.ok) {
      const json = await response.clone().json();
      item.contract = { keys: Object.keys(json.data || {}), categoryFields: Object.keys(json.data?.types?.[0] || {}), bookFields: Object.keys(json.data?.bookList?.[0] || {}) };
    }
    return response; }
  catch (error) { item.networkError = error.cause?.code || error.name; throw error; }
});
const c = config();
// Validation probes use ephemeral metadata; production provider switches stay unchanged.
const allowed = false;
const adapter = new DramaBox(transport, c, undefined, allowed);
async function check(method, args, operation, project) {
  const start = requests.length;
  try {
    const result = await operation();
    operations.push({ method, args, success: true, ...project(result), requests: requests.slice(start) });
    console.log(`${method}: OK`); return result;
  } catch (error) {
    operations.push({ method, args, success: false, status: error.status || 503, upstreamStatus: error.upstreamStatus || null, suppressedBySharedCooldown: requests.length === start, message: error.status ? error.message : 'Storage or SDK failure', requests: requests.slice(start) });
    console.log(`${method}: ${error.status || 503} ${error.status ? error.message : 'Storage or SDK failure'}`);
    return null;
  }
}
const summary = r => ({ titles: r.titles.length, hasMore: r.hasMore });
const query = process.argv[2] || 'amor';
const catalog = await check('getDramaList', [1, 24], () => adapter.getDramaList(), summary);
const search = await check('searchDrama', [query, 1, 24], () => adapter.searchDrama(query), summary);
const categories = await check('getCategories', [1, 30], () => adapter.getCategories(), r => ({ categories: r.length }));
let categoryBooks;
if (categories?.[0]) categoryBooks = await check('getBooksByCategory', [categories[0].id, 1, 24], () => adapter.getBooksByCategory(categories[0].id), summary);
else operations.push({ method: 'getBooksByCategory', skipped: 'No real category ID returned' });
let known = catalog?.titles[0] || search?.titles[0] || categoryBooks?.titles[0];
let idSource = known ? 'SDK live result' : null;
if (!known) {
  const stored = await miniStore.titles();
  known = stored.find(t => /^\d{1,32}$/.test(t.externalIds?.['platform:dramabox'] || '') && t.refs.some(r => r.provider === 'microdramalist'));
  if (known) idSource = 'Existing MicroDramaList record in MySQL';
}
const bookId = known?.externalIds?.['platform:dramabox'];
if (bookId) {
  await check('getDramaDetail', [bookId], () => adapter.getDramaDetail(bookId), r => ({ bookId: r.externalIds['platform:dramabox'], episodeCount: r.episodeCount, synopsis: !!r.synopsis, idSource }));
  const ref = { provider: 'dramabox', id: bookId, platform: 'dramabox', language: 'pt' };
  const episodes = await check('getChapters', [bookId], () => adapter.getChapters(ref), r => ({ episodes: r.length, available: r.filter(e => e.available).length, idSource }));
  if (episodes?.[0]) await check('getEpisodeDetails', [bookId, episodes[0].playbackIndex], () => adapter.getEpisodeDetails(ref, episodes[0].id), r => ({ id: r.id, index: r.playbackIndex, noMediaRequested: true }));
  else operations.push({ method: 'getEpisodeDetails', skipped: 'No real chapter/index returned' });
} else for (const method of ['getDramaDetail', 'getChapters', 'getEpisodeDetails']) operations.push({ method, skipped: 'No real book/chapter ID available; no invented identifiers used' });
await check('getLatest', [1], () => adapter.getLatest(), summary);
await check('getRecommendedBooks', [], () => adapter.getRecommendedBooks(), summary);
await check('getTrending', [], () => adapter.getTrending(), summary);
operations.push({ method: 'getStreamUrl', skipped: 'No independently licensed title with validated playback supplied; no video request performed' });
const report = { checkedAt: new Date().toISOString(), sdk: '@zhadev/dramabox@0.0.2', sdkExecuted: true, mockResponses: false, tlsVerification: true, metadataPersistenceAuthorized: allowed, mediaRequested: false, operations, externalRequests: requests.length, otherProviderRequests: 0 };
await writeFile('docs/dramabox-smoke.json', JSON.stringify(report, null, 2) + '\n');
console.log(`Report: docs/dramabox-smoke.json (${requests.length} actual HTTP requests)`);
// A probe failure must be visible to CI/operators.
process.exit(operations.some(o => o.success === false) ? 1 : 0);
