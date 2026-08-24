import assert from "node:assert/strict";
import test from "node:test";

import { SPORTS_PROVIDERS } from "../lib/sports-providers.ts";

test("registers five distinct official sports providers", () => {
  assert.equal(SPORTS_PROVIDERS.length, 5);
  assert.equal(new Set(SPORTS_PROVIDERS.map((provider) => provider.id)).size, 5);

  for (const provider of SPORTS_PROVIDERS) {
    assert.match(provider.officialUrl, /^https:\/\//);
    assert.ok(provider.sports.length > 0);
    if (provider.embedUrl) assert.match(new URL(provider.embedUrl).hostname, /^www\.youtube-nocookie\.com$/);
  }
});
