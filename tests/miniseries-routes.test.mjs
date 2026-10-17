import assert from "node:assert/strict";
import test from "node:test";
test("built routes: protect catalog/episodes/play and admin without contacting providers", async () => {
  const { default: worker } = await import("../dist/server/index.js");
  const env = { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
  const ctx = { waitUntil() {}, passThroughOnException() {} };
  const call = (path, init) => worker.fetch(new Request(`http://localhost${path}`, init), env, ctx);
  const valid = "mini_00000000-0000-4000-8000-000000000000";
  const original = globalThis.fetch; let outbound = 0;
  globalThis.fetch = async () => { outbound++; throw Error("No provider should be contacted"); };
  try {
    assert.equal((await call("/api/miniseries")).status, 401);
    assert.equal((await call("/api/miniseries?platform=dramabox")).status, 401);
    assert.equal((await call("/api/miniseries?provider=reelshort&q=test")).status, 401);
    assert.equal((await call("/api/miniseries?platform=invalid")).status, 401);
    assert.equal((await call("/api/miniseries?page=0")).status, 400);
    assert.equal((await call("/api/miniseries?id=invalid")).status, 400);
    assert.equal((await call("/api/miniseries/episodes")).status, 400);
    assert.equal((await call(`/api/miniseries/episodes?id=${valid}&source=syln:dramabox:42`)).status, 401);
    const play = await call("/api/miniseries/play", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: valid, source: "syln:dramabox:42", episode: "1" }) });
    assert.equal(play.status, 401); assert.equal(play.headers.get("cache-control"), "no-store");
    assert.equal((await call("/api/miniseries/play", { method: "POST", headers: { Origin: "https://unrelated.example", "Content-Type": "application/json" }, body: "{}" })).status, 403);
    assert.equal((await call("/api/admin/miniseries")).status, 403);
    assert.equal((await call("/api/admin/miniseries", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "refresh", page: 1 }) })).status, 403);
    assert.equal((await call("/api/admin/miniseries", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "refreshExternal", provider: "reelshort", feed: "newrelease", page: 1 }) })).status, 403);
    for (const action of ["authorizePlayback", "revokePlayback"]) {
      assert.equal((await call("/api/admin/miniseries", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, id: valid, source: "syln:dramabox:42", reference: "MOCK unauthorized caller" }) })).status, 403);
    }
    assert.equal(outbound, 0);
  } finally { globalThis.fetch = original; }
});
