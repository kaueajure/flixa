import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";

import {
  PROTECTED_PLAYER_ALLOW,
  PROTECTED_PLAYER_REFERRER_POLICY,
  PROTECTED_PLAYER_SANDBOX,
} from "../lib/player-frame-policy.ts";

const FORBIDDEN_SANDBOX_CAPABILITIES = [
  "allow-downloads",
  "allow-forms",
  "allow-modals",
  "allow-popups",
  "allow-popups-to-escape-sandbox",
  "allow-storage-access-by-user-activation",
  "allow-top-navigation",
  "allow-top-navigation-by-user-activation",
  "allow-top-navigation-to-custom-protocols",
];

test("keeps every advertising and navigation escape capability out of the player sandbox", () => {
  const capabilities = new Set(PROTECTED_PLAYER_SANDBOX.split(/\s+/));
  assert.deepEqual([...capabilities], [
    "allow-scripts",
    "allow-same-origin",
    "allow-presentation",
    "allow-orientation-lock",
  ]);
  for (const capability of FORBIDDEN_SANDBOX_CAPABILITIES) {
    assert.equal(capabilities.has(capability), false, capability);
  }
  assert.equal(PROTECTED_PLAYER_REFERRER_POLICY, "no-referrer");
});

test("grants playback APIs while denying advertising and privacy-sensitive APIs", () => {
  assert.match(PROTECTED_PLAYER_ALLOW, /autoplay \*/);
  assert.match(PROTECTED_PLAYER_ALLOW, /fullscreen \*/);
  assert.match(PROTECTED_PLAYER_ALLOW, /encrypted-media \*/);
  assert.match(PROTECTED_PLAYER_ALLOW, /picture-in-picture \*/);
  assert.match(PROTECTED_PLAYER_ALLOW, /attribution-reporting 'none'/);
  assert.match(PROTECTED_PLAYER_ALLOW, /browsing-topics 'none'/);
  assert.match(PROTECTED_PLAYER_ALLOW, /payment 'none'/);
});

test("uses the protected policy on trailer, sports and admin frames", () => {
  for (const path of ["../app/sports-view.tsx", "../app/admin/page.tsx"]) {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");
    assert.match(source, /sandbox=\{PROTECTED_PLAYER_SANDBOX\}/, path);
    assert.match(source, /allow=\{PROTECTED_PLAYER_ALLOW\}/, path);
  }
  const pageSource = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(pageSource, /className="trailer-frame"[\s\S]*sandbox=\{PROTECTED_PLAYER_SANDBOX\}/);
});

test("starts protected and removes sandbox only after an explicit risk confirmation", () => {
  const pageSource = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(pageSource, /\[sandboxEnabled, setSandboxEnabled\] = useState\(true\)/);
  assert.match(pageSource, /sandbox=\{sandboxEnabled \? PROTECTED_PLAYER_SANDBOX : undefined\}/);
  assert.match(pageSource, /Entendo os riscos, desativar/);
  assert.match(pageSource, /Nudez e pornografia/);
  assert.match(pageSource, /O Flixa não controla nem se responsabiliza/);
  assert.doesNotMatch(pageSource, /sandbox=\{partyProviderId \? undefined/);
});

test("blocks ad video files and VAST endpoints before player and media exemptions", () => {
  const workerSource = readFileSync(new URL("../public/adblock-sw.js", import.meta.url), "utf8");
  let fetchHandler;
  const context = vm.createContext({
    URL,
    Response,
    self: {
      addEventListener(type, handler) {
        if (type === "fetch") fetchHandler = handler;
      },
      skipWaiting() {},
      clients: { claim() {} },
    },
  });
  const results = vm.runInContext(`${workerSource}\n[\n` +
    `  isAdUrl("https://cdn.doubleclick.net/campaign/preroll.mp4"),\n` +
    `  isAdUrl("https://videasy.to/player/vast.xml"),\n` +
    `  isAdUrl("https://videasy.to/player/movie/808"),\n` +
    `  isAdUrl("https://media.example/video/movie.m3u8")\n` +
    `]`, context);
  assert.deepEqual(Array.from(results), [true, true, false, false]);

  let blockedResponse;
  fetchHandler({
    request: { url: "https://cdn.doubleclick.net/campaign/preroll.mp4" },
    respondWith(response) { blockedResponse = response; },
  });
  assert.equal(blockedResponse.status, 204);
  assert.equal(blockedResponse.body, null);
});
