// Deliberately small, unauthenticated probes. No video requests, no catalog sweep.
import { writeFile } from "node:fs/promises";
import { microTitle } from "../lib/miniseries/providers/microdramalist.ts";
const results = [];
async function probe(url) {
  try {
    const r = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "Flixa-integration-validation/1.0" }, redirect: "error", signal: AbortSignal.timeout(15000) });
    const raw = await r.text(); let data;
    try { data = JSON.parse(raw); } catch { /* Record HTML without pretending it is API data. */ }
    const result = { url, status: r.status, contentType: r.headers.get("content-type"), rateLimit: r.headers.get("X-RateLimit-Limit"), remaining: r.headers.get("X-RateLimit-Remaining"), retryAfter: r.headers.get("Retry-After"), shape: Array.isArray(data) ? "array" : data ? "object" : "non-json" };
    if (Array.isArray(data)) { result.count = data.length; result.firstKeys = Object.keys(data[0] || {}); }
    else if (data) { result.keys = Object.keys(data); if (data.error) result.error = data.error; }
    if (url.endsWith("/plans")) result.freePlan = data?.data?.find((p) => p.price_idr === 0);
    if (url.includes("/dramas/") && data) { result.id = data.id; result.episodeCount = data.episodeCount; result.languages = data.languages; result.platforms = data.availableOn?.map(({ platform, externalId, unverified }) => ({ platform, externalId, unverified: unverified === true })); }
    if (r.ok && url.includes("microdramalist.com/api/v1/")) {
      if (Array.isArray(data)) data.forEach((row) => microTitle(row)); else microTitle(data, true);
      result.normalizationValid = true;
    }
    results.push(result); return data;
  } catch (e) { results.push({ url, error: e.message }); }
}
const found = await probe("https://microdramalist.com/api/v1/search?q=love");
if (Array.isArray(found) && /^mdid-[a-z0-9]+$/i.test(found[0]?.id)) await probe(`https://microdramalist.com/api/v1/dramas/${found[0].id}`);
for (const path of ["health", "plans", "catalog?content_type=short_drama&limit=1", "search?q=love&limit=1"]) await probe(`https://api.syln.dev/v1/${path}`);
const report = { checkedAt: new Date().toISOString(), authenticated: false, playbackTested: false, note: "Live HTTP observations, never documentation examples. Unauthenticated probes only; no playback requested.", results };
await writeFile(new URL("../docs/miniseries-smoke.json", import.meta.url), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
