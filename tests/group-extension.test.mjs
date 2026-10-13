import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";
import { descendantOf, normalizeCommand, validPlayback, VERSION, sitePattern, siteRegistrationId } from "../extension/flixa-group/protocol.js";
import { parsePartyRoomState, validPartySource, partyCapabilities } from "../lib/watch-party.ts";

test("extension room rejects unknown providers and mismatched source IDs", () => {
  const state = { controlMode: "extension", providerId: "myembed", sourceId: "myembed", media: { id: "550", kind: "movie", title: "Filme" }, playback: { paused: true, currentTime: 25, updatedAt: Date.now(), sequence: 1, durationSeconds: 8348 } };
  assert.deepEqual(parsePartyRoomState(state), state);
  assert.equal(parsePartyRoomState({ ...state, sourceId: "vidzen" }), null);
  assert.equal(parsePartyRoomState({ ...state, providerId: "unknown", sourceId: "unknown" }), null);
  assert.equal(parsePartyRoomState({ ...state, controlMode: "native" }), null);
  assert.equal(validPartySource("cdn-embed", "extension", "cdn-tmdb"), true);
  assert.equal(validPartySource("cdn-embed", "extension", "cdn-imdb"), true);
  assert.equal(validPartySource("cdn-embed", "extension", "cdn-embed-evil"), false);
  assert.equal(validPartySource("myembed", "extension", "https://evil.test"), false);
  assert.equal(partyCapabilities("ABC234", "guest")["watch-party:ABC234"].includes("publish"), false);
});

test("extension controls only descendants of the selected iframe", () => {
  const frames = [{ frameId: 0, parentFrameId: -1 }, { frameId: 5, parentFrameId: 0 }, { frameId: 8, parentFrameId: 5 }, { frameId: 9, parentFrameId: 8 }, { frameId: 10, parentFrameId: 0 }, { frameId: 11, parentFrameId: 11 }];
  assert.equal(descendantOf(frames, 9, 5), true);
  assert.equal(descendantOf(frames, 5, 5), true);
  assert.equal(descendantOf(frames, 10, 5), false);
  assert.equal(descendantOf(frames, 11, 5), false);
  assert.equal(descendantOf(frames, 0, 5), false);
});

test("empty media, advertisements and invalid controls are not treated as playable", () => {
  const state = { currentTime: 5, duration: 7200, paused: false, ready: 4, error: "" };
  assert.equal(Boolean(validPlayback(state)), true);
  for (const invalid of [{ ...state, duration: 30 }, { ...state, duration: Infinity }, { ...state, currentTime: NaN }, { ...state, ready: 0 }, { ...state, error: "network" }]) assert.equal(Boolean(validPlayback(invalid)), false);
  assert.equal(normalizeCommand("extract"), null);
  assert.equal(normalizeCommand("seek", Infinity), null);
  assert.equal(normalizeCommand("seek", -10), null);
  assert.deepEqual(normalizeCommand("seek", 10), { command: "seek", time: 10 });
});

test("download ZIP contains the current extension, uses no remote scripts or credentials", () => {
  const zip = readFileSync(new URL("../public/downloads/flixa-grupo.zip", import.meta.url));
  const entries = new Map(); let offset = 0;
  while (zip.readUInt32LE(offset) === 0x04034b50) {
    const size = zip.readUInt32LE(offset + 18); const nameSize = zip.readUInt16LE(offset + 26); const extraSize = zip.readUInt16LE(offset + 28);
    const name = zip.subarray(offset + 30, offset + 30 + nameSize).toString(); const start = offset + 30 + nameSize + extraSize;
    assert.equal(name.includes(".."), false);
    entries.set(name, inflateRawSync(zip.subarray(start, start + size)));
    offset = start + size;
  }
  const manifest = JSON.parse(entries.get("flixa-grupo/manifest.json"));
  assert.equal(manifest.version, VERSION); assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.host_permissions.includes("<all_urls>"), false);
  assert.equal(manifest.permissions.includes("cookies"), false);
  assert.equal(manifest.permissions.includes("webRequest"), false);
  for (const filename of ["manifest.json", "background.js", "site-bridge.js", "media-probe.js", "popup.html", "popup.css", "popup.js", "protocol.js", "providers.js", "README.md", "logo.png", "icon.png"]) assert.equal(entries.get(`flixa-grupo/${filename}`)?.equals(readFileSync(new URL(`../extension/flixa-group/${filename}`, import.meta.url))), true, `ZIP desatualizado: ${filename}`);
  assert.equal(entries.get("flixa-grupo/popup.html").toString().includes('src="https://'), false);
  for (const [name, data] of entries) if (name.endsWith(".js")) assert.equal(/ABLY_API_KEY|WATCH_PARTY_SECRET|document\.cookie/.test(data.toString()), false);
});


test("Chrome permissions support local network addresses with a port", () => {
  assert.equal(sitePattern("http://192.168.15.150:5174/#home"), "http://192.168.15.150/*");
  assert.equal(sitePattern("http://localhost:5180/"), "http://localhost/*");
  assert.equal(sitePattern("https://flixa.example/grupo"), "https://flixa.example/*");
  assert.notEqual(siteRegistrationId("http://localhost:5174"), siteRegistrationId("http://localhost:5180"));
  assert.throws(() => sitePattern("chrome://extensions"));
});
