import assert from "node:assert/strict";
import test from "node:test";

test("renders the public Caderno Collie metadata before authentication", async () => {
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
  assert.match(html, /<title>Caderno Collie[^<]*<\/title>/i);
  assert.match(html, /<meta(?=[^>]*property=["']og:image["'])(?=[^>]*content=["'][^"']*\/og-caderno-collie\.png["'])[^>]*>/i);
  assert.doesNotMatch(html, /class=["']site-intro-video["']/i);
  assert.match(html, /<img(?=[^>]*class=["']boot-logo["'])(?=[^>]*src=["']\/logo-transparent\.png["'])[^>]*>/i);
  assert.doesNotMatch(html, /name=["']codex-preview["']/i);
});
