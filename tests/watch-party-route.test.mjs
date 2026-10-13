import assert from "node:assert/strict";
import test from "node:test";

test("built backend refuses unauthenticated group access without issuing room credentials", async () => {
  const originalKey = process.env.ABLY_API_KEY;
  process.env.ABLY_API_KEY = "";
  try {
    const { default: worker } = await import("../dist/server/index.js");
    const response = await worker.fetch(new Request("http://localhost/api/watch-party/ticket", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create" }) }), { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } }, { waitUntil() {}, passThroughOnException() {} });
    assert.equal(response.status, 401);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const data = await response.json();
    assert.equal(data.erro, "Não autenticado.");
    assert.equal(data.tokenRequest, undefined);
    assert.equal(data.roomCode, undefined);
  } finally {
    if (originalKey == null) delete process.env.ABLY_API_KEY;
    else process.env.ABLY_API_KEY = originalKey;
  }
});
