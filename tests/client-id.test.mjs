import assert from "node:assert/strict";
import test from "node:test";
import { createClientId } from "../lib/client-id.ts";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test("uses native UUID when available with the correct crypto receiver", () => {
  const provider = { randomUUID() { assert.equal(this, provider); return "native-id"; } };
  assert.equal(createClientId(provider), "native-id");
});

test("HTTP LAN clients without randomUUID use getRandomValues and valid UUID bits", () => {
  assert.equal(createClientId({ getRandomValues(bytes) { bytes.fill(255); return bytes; } }), "ffffffff-ffff-4fff-bfff-ffffffffffff");
});

test("missing Web Crypto does not crash session tracking", () => {
  const ids = Array.from({ length: 100 }, () => createClientId(null));
  ids.forEach((id) => assert.match(id, uuidPattern));
  assert.equal(new Set(ids).size, ids.length);
});

test("randomUUID property must be callable before using it", () => {
  assert.match(createClientId({ randomUUID: undefined, getRandomValues(bytes) { bytes.fill(0); return bytes; } }), uuidPattern);
});
