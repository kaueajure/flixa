// Version-pinned transport injection. No endpoint, signature or access rule is changed.
import { readFile, writeFile } from 'node:fs/promises';
const root = new URL('../node_modules/@zhadev/dramabox/', import.meta.url);
const pkg = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
if (pkg.version !== '0.0.2') throw new Error('Review DramaBox transport patch before changing SDK version.');
for (const file of ['dist/index.mjs', 'dist/index.cjs']) {
  const path = new URL(file, root);
  let source = await readFile(path, 'utf8');
  // Actual public browse response uses id/name, not typeTwoId/typeTwoName.
  source = source.replace('typeTwoId: item.typeTwoId,', 'typeTwoId: item.typeTwoId ?? item.id,');
  source = source.replace('typeTwoName: item.typeTwoName,', 'typeTwoName: item.typeTwoName ?? item.name,');
  source = source.replaceAll('tagV3s: book.tagV3s || [],', 'tagV3s: book.tagV3s || book.typeTwoNames || book.tags || [],');
  // Preserve unknown/explicit lock states instead of converting missing flags to free.
  source = source.replace('isCharge: chapter.isCharge === 1,', 'isCharge: chapter.isCharge === 1 || chapter.isCharge === true ? true : chapter.isCharge === 0 || chapter.isCharge === false ? false : undefined,');
  source = source.replace('isLocked: chapter.isCharge === 1\n', 'isLocked: chapter.isCharge === 1 || chapter.isCharge === true || chapter.isLocked === 1 || chapter.isLocked === true ? true : (chapter.isCharge === 0 || chapter.isCharge === false) && (chapter.isLocked === undefined || chapter.isLocked === 0 || chapter.isLocked === false) ? false : undefined\n');
  const categoryStart = source.indexOf('  async getBooksByCategory(');
  const categoryEnd = source.indexOf('  async getRecommendedBooks(', categoryStart);
  if (categoryStart < 0 || categoryEnd < 0) throw new Error('Unexpected category method');
  const categorySource = source.slice(categoryStart, categoryEnd)
    .replace('chapterCount: book.chapterCount,', 'chapterCount: book.chapterCount, language: book.simpleLanguage || book.language,')
    .replace('return this.buildResponse(true, books);', 'return this.buildResponse(true, books, null, { page: data?.data?.currentPage, pages: data?.data?.pages, total: data?.data?.total, language: data?.data?.language });');
  // Avoid duplicating the language projection when postinstall/prebuild run again.
  if (!source.slice(categoryStart, categoryEnd).includes('pages: data?.data?.pages')) source = source.slice(0, categoryStart) + categorySource + source.slice(categoryEnd);
  if (source.includes('FLIXA_SERVER_TRANSPORT_V1')) { await writeFile(path, source); continue; }
  const needle = 'async function httpRequest(url, options = {}) {';
  if (!source.includes(needle)) throw new Error(`Unexpected DramaBox distribution: ${file}`);
  source = source.replace(needle, `${needle}\n  // FLIXA_SERVER_TRANSPORT_V1: fail closed outside the audited backend transport.\n  if (typeof config.flixaHttpRequest !== "function") throw new Error("DramaBox requires Flixa server transport");\n  return config.flixaHttpRequest(url, options);\n`);
  source = source.replaceAll('rejectUnauthorized: false', 'rejectUnauthorized: true');
  // SDK rejects index zero although its chapters may use zero-based indices.
  source = source.replace('if (!bookId || !episodeIndex)', 'if (!bookId || !Number.isSafeInteger(episodeIndex) || episodeIndex < 0)');
  source = source.replace('if (!bookId || !episode)', 'if (!bookId || !Number.isSafeInteger(episode) || episode < 0)');
  // Exported config is also the fail-closed runtime attestation for this patch.
  source += '\nconfig.flixaTransportVersion = 1;\n';
  await writeFile(path, source);
}
