import assert from "node:assert/strict";
import test from "node:test";
import { mapStreamedMatch, mapStreamedStreams, streamedTeamBadge } from "../lib/sports-catalog.ts";
import { getSportsCatalog, getMatchStreams } from "../lib/streamed-api.ts";

const match = {
  id: "raptors-knicks", title: "Toronto Raptors vs New York Knicks", category: "basketball",
  date: 1791932400000, poster: "/api/images/proxy/example.webp",
  teams: { home: { name: "Toronto Raptors", badge: "opaque" }, away: { name: "New York Knicks" } },
  sources: [{ source: "admin", id: "ppv-raptors-knicks" }],
};
const streams = [
  { id: "ppv-raptors-knicks", streamNo: 1, language: "English", hd: true, source: "admin", embedUrl: "https://embed.st/embed/admin/ppv-raptors-knicks/1" },
  { id: "ppv-raptors-knicks", streamNo: 2, language: "English", hd: false, source: "admin", embedUrl: "https://embed.st/embed/admin/ppv-raptors-knicks/2" },
];

test("maps inspected categories, timestamps and live membership without guessed fields", () => {
  const event = mapStreamedMatch(match, new Set([match.id]));
  assert.equal(event.status, "live");
  assert.equal(event.sport, "Basquete");
  assert.equal(event.thumbnail, "https://streamed.pk/api/images/proxy/example.webp");
  assert.equal(event.homeScore, undefined);
  assert.deepEqual(event.sources, []);
  assert.deepEqual(event.streamRefs, match.sources);
  assert.equal(mapStreamedMatch(match, new Set(), 0).status, "upcoming");
  assert.equal(mapStreamedMatch(match, new Set(), match.date + 1).status, "unknown");
  assert.equal(mapStreamedMatch({ ...match, date: 0 }, new Set()).startAt, "");
  assert.equal(mapStreamedMatch({ ...match, category: "american-football" }, new Set()).sport, "Futebol americano");
  assert.equal(mapStreamedMatch({ ...match, category: "football" }, new Set()).sport, "Futebol");
  assert.equal(mapStreamedMatch({ ...match, category: "golf" }, new Set()), null);
  assert.equal(mapStreamedMatch({}, new Set()), null);
});

test("maps team badge references to the verified proxy and rejects malformed identifiers", () => {
  assert.equal(streamedTeamBadge("opaque+badge-key_123="), "https://streamed.pk/api/images/proxy/opaque+badge-key_123=.webp");
  const event = mapStreamedMatch(match, new Set());
  assert.equal(event.homeBadge, "https://streamed.pk/api/images/proxy/opaque.webp");
  assert.equal(event.awayBadge, undefined);
  for (const value of [undefined, null, "", "../other", "https://attacker.example/image", "key?x=1", "key#fragment", "key/other", "<script>", "x".repeat(4097)]) {
    assert.equal(streamedTeamBadge(value), undefined);
  }
});

test("uses returned embed URLs and keeps multiple streams with safe protocol validation", () => {
  assert.equal(mapStreamedStreams(streams).length, 2);
  assert.equal(mapStreamedStreams(streams)[0].embedUrl, streams[0].embedUrl);
  assert.match(mapStreamedStreams(streams)[0].label, /English · HD/);
  assert.deepEqual(mapStreamedStreams([{ ...streams[0], embedUrl: "javascript:alert(1)" }]), []);
  assert.deepEqual(mapStreamedStreams([{ ...streams[0], embedUrl: "https://user:password@example.com" }]), []);
  assert.deepEqual(mapStreamedStreams([]), []);
  assert.throws(() => mapStreamedStreams({ streams }), /inválida/);
});

test("coalesces discovery and stream calls, preserves other sports and handles failure/empty responses", async () => {
  const originalFetch = globalThis.fetch;
  const originalNow = Date.now;
  let now = originalNow();
  Date.now = () => now;
  const calls = [];
  let mode = "ok";
  globalThis.fetch = async (input) => {
    const url = new URL(input);
    calls.push(url.pathname);
    if (url.hostname === "www.thesportsdb.com") {
      return Response.json({ events: [{ idEvent: "hockey", strEvent: "Hockey match", strSport: "Ice Hockey" }] });
    }
    if (mode === "fail") return new Response("unavailable", { status: 503 });
    if (mode === "invalid") return Response.json({ invalid: true });
    if (mode === "empty") return Response.json([]);
    if (url.pathname === "/api/sports") return Response.json([{ id: "basketball", name: "Basketball" }, { id: "american-football", name: "American Football" }]);
    if (url.pathname.startsWith("/api/stream/")) return Response.json(streams);
    if (url.pathname === "/api/matches/live") return Response.json([match]);
    return Response.json([match, { ...match, id: "nfl", category: "american-football", date: 0 }]);
  };
  try {
    const [a, b] = await Promise.all([getSportsCatalog(), getSportsCatalog()]);
    assert.deepEqual(a, b);
    assert.equal(a.events.filter((event) => event.id === "streamed-raptors-knicks").length, 1);
    assert.equal(a.events.find((event) => event.id === "streamed-raptors-knicks").status, "live");
    assert.ok(a.events.some((event) => event.sport === "Hóquei no gelo"));
    assert.equal(calls.filter((path) => path === "/api/matches/all").length, 1);
    assert.ok(!calls.some((path) => path.startsWith("/api/stream/")));
    const [first, second] = await Promise.all([getMatchStreams("streamed-raptors-knicks"), getMatchStreams("streamed-raptors-knicks")]);
    assert.deepEqual(first, second);
    assert.equal(first.sources.length, 2);
    assert.equal(calls.filter((path) => path.startsWith("/api/stream/")).length, 1);
    assert.equal(await getMatchStreams("not-an-event"), null);
    now += 61000;
    mode = "fail";
    const stale = await getSportsCatalog();
    assert.ok(stale.errors.length > 0);
    assert.ok(stale.events.some((event) => event.id === "streamed-raptors-knicks"));
    assert.equal(stale.updatedAt, a.updatedAt);
    const failedStreams = await getMatchStreams("streamed-raptors-knicks");
    assert.equal(failedStreams.sources.length, 0);
    assert.equal(failedStreams.errors.length, 1);
    now += 61000;
    mode = "invalid";
    assert.ok((await getSportsCatalog()).errors.some((error) => error.includes("JSON inválida")));
    now += 61000;
    mode = "empty";
    const empty = await getSportsCatalog();
    assert.equal(empty.events.filter((event) => event.streamRefs).length, 0);
    assert.deepEqual(empty.errors, []);
    const count = calls.length;
    await getSportsCatalog();
    assert.equal(calls.length, count);
  } finally {
    globalThis.fetch = originalFetch;
    Date.now = originalNow;
  }
});
