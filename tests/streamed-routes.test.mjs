import assert from "node:assert/strict";
import test from "node:test";

test("built Worker serves sports discovery and stream routes with validated event IDs", async () => {
  let worker;
  const env = { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
  const ctx = { waitUntil() {}, passThroughOnException() {} };
  const call = (path) => worker.fetch(new Request(`http://localhost${path}`), env, ctx);
  const originalFetch = globalThis.fetch;
  const embedUrl = "https://embed.st/embed/admin/ppv-nfl-network/1";
  globalThis.fetch = async (input) => {
    const url = new URL(input);
    if (url.hostname === "www.thesportsdb.com") return Response.json({ events: [] });
    if (url.pathname === "/api/sports") return Response.json([{ id: "american-football", name: "American Football" }]);
    if (url.pathname.startsWith("/api/stream/")) return Response.json([{ id: "ppv-nfl-network", streamNo: 1, source: "admin", language: "English", hd: true, embedUrl }]);
    if (url.pathname === "/api/matches/all") return Response.json([{
      id: "ppv-nfl-network", title: "NFL Network", category: "american-football", date: 0,
      sources: [{ source: "admin", id: "ppv-nfl-network" }],
    }]);
    return Response.json([]);
  };
  try {
    ({ default: worker } = await import(new URL("../dist/server/index.js", import.meta.url)));
    assert.equal((await call("/api/sports/streams")).status, 400);
    assert.equal((await call(`/api/sports/streams?eventId=${"x".repeat(301)}`)).status, 400);
    const catalog = await call("/api/sports");
    assert.equal(catalog.status, 200);
    assert.equal(catalog.headers.get("cache-control"), "no-store");
    const data = await catalog.json();
    assert.equal(data.events[0].sport, "Futebol americano");
    assert.equal(data.events[0].startAt, "");
    const streams = await call("/api/sports/streams?eventId=streamed-ppv-nfl-network");
    assert.equal(streams.status, 200);
    assert.equal((await streams.json()).sources[0].embedUrl, embedUrl);
    assert.equal((await call("/api/sports/streams?eventId=unknown")).status, 404);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
