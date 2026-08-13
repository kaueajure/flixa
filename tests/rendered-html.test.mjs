import assert from "node:assert/strict";
import test from "node:test";

test("renders the finalized Flixa opening and metadata", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  const response = await worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );

  assert.equal(response.status, 200);
  assert.match(
    response.headers.get("content-type") ?? "",
    /^text\/html\b/i,
  );
  const html = await response.text();
  assert.match(html, /<title>Flixa<\/title>/i);
  assert.match(html, /<meta(?=[^>]*property=["']og:image["'])(?=[^>]*content=["'][^"']*\/og\.png["'])[^>]*>/i);
  assert.match(html, /<video(?=[^>]*class=["']site-intro-video["'])(?=[^>]*src=["']\/intro\.mp4["'])[^>]*>/i);
  assert.match(html, /<img(?=[^>]*class=["']boot-logo["'])(?=[^>]*src=["']\/logo\.png["'])[^>]*>/i);
  assert.doesNotMatch(html, /name=["']codex-preview["']/i);
});
