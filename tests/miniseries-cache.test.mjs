import assert from "node:assert/strict";
import test from "node:test";
import { MiniTransport } from "../lib/miniseries/transport.ts";
import { MemoryStore } from "./miniseries-helpers.mjs";

test("persistent cache (MOCK store): coalesces concurrent calls, caches empty results across instances and expires", async () => {
  const store = new MemoryStore(); const a = new MiniTransport(store); const b = new MiniTransport(store);
  let calls = 0; const load = async () => { calls++; return []; };
  const result = await Promise.all([a.cached("x", 60000, load), a.cached("x", 60000, load)]);
  assert.deepEqual(result, [[], []]); assert.equal(calls, 1);
  await b.cached("x", 60000, load); assert.equal(calls, 1);
  store.cache.get("x").expiresAt = Date.now() - 1;
  await b.cached("x", 60000, load); assert.equal(calls, 2);
});
test("cache (MOCK): leases deduplicate across processes and failures are negatively cached", async () => {
  const store = new MemoryStore(), a = new MiniTransport(store), b = new MiniTransport(store);
  let finish; let calls = 0;
  const waiting = new Promise((resolve) => { finish = resolve; });
  const first = a.cached("slow", 60000, async () => { calls++; await waiting; return 42; });
  await new Promise((resolve) => setImmediate(resolve));
  await assert.rejects(b.cached("slow", 60000, async () => { calls++; }), /em andamento/);
  finish(); assert.equal(await first, 42); assert.equal(calls, 1);
  const fail = async () => { calls++; throw new Error("MOCK failure"); };
  await assert.rejects(a.cached("bad", 60000, fail));
  await assert.rejects(b.cached("bad", 60000, fail)); assert.equal(calls, 2);
  assert.equal(store.cache.has("bad"), false);
});
test("cache (MOCK): serves bounded stale data on error, never silently refreshes every visit", async () => {
  const store = new MemoryStore(), t = new MiniTransport(store);
  await store.put("stale", [1], -1, 60000);
  assert.deepEqual(await t.cached("stale", 60000, async () => { throw Error(); }, 60000), [1]);
  store.cache.get("stale").staleUntil = Date.now() - 1;
  await assert.rejects(t.cached("stale", 60000, async () => []));
});
test("HTTP 429 (MOCK): persists Retry-After and pauses every endpoint without retries", async () => {
  const store = new MemoryStore(); let count = 0;
  const fetcher = async () => { count++; return Response.json({}, { status: 429, headers: { "Retry-After": "120" } }); };
  const a = new MiniTransport(store, fetcher), b = new MiniTransport(store, fetcher);
  await assert.rejects(a.request("syln", "https://api.syln.dev/v1/catalog"), (e) => e.status === 429);
  await assert.rejects(b.request("syln", "https://api.syln.dev/v1/search?q=mock"), (e) => e.status === 429);
  assert.equal(count, 1); assert.ok((await store.get("cooldown:syln")).value >= Date.now() + 119000);
});
test("rate and concurrency limits (MOCK): permits two outbound requests, caps free API budget", async () => {
  const store = new MemoryStore(); let release; let count = 0;
  const wait = new Promise((resolve) => { release = resolve; });
  const t = new MiniTransport(store, async () => { count++; await wait; return Response.json([]); });
  const a = t.request("syln", "https://api.syln.dev/v1/catalog"), b = t.request("syln", "https://api.syln.dev/v1/search?q=mock");
  await new Promise((resolve) => setImmediate(resolve));
  await assert.rejects(t.request("syln", "https://api.syln.dev/v1/catalog?page=2"), /ocupada/);
  release(); await Promise.all([a, b]); assert.equal(count, 2);
  const free = new MiniTransport(new MemoryStore(), async () => Response.json([]));
  // Keep tests away from wall-clock minute boundaries.
  const now = Date.now; Date.now = () => 1800000000000;
  try {
    for (let i = 0; i < 15; i++) await free.request("microdramalist", "https://microdramalist.com/api/v1/search?q=mock");
    await assert.rejects(free.request("microdramalist", "https://microdramalist.com/api/v1/search?q=mock"), (e) => e.status === 429);
  } finally { Date.now = now; }
});
test("HTTP errors (MOCK): rejects HTML, invalid JSON and failed HTTP without consuming retries", async () => {
  for (const response of [new Response("html", { status: 200 }), Response.json({}, { status: 401 }), Response.json({}, { status: 503 })]) {
    let calls = 0; const t = new MiniTransport(new MemoryStore(), async () => { calls++; return response; });
    await assert.rejects(t.request("syln", "https://api.syln.dev/v1/catalog")); assert.equal(calls, 1);
  }
});
