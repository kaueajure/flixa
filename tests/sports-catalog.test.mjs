import assert from "node:assert/strict";
import test from "node:test";

import {
  SPORTS_LEAGUES,
  SPORTS_VIDEO_PROVIDERS,
  addSportsVideoSource,
  dedupeSportsEvents,
  mapSportsDbEvent,
  mapSportsVideoSource,
} from "../lib/sports-catalog.ts";

test("uses a multi-sport league catalog instead of static stream providers", () => {
  assert.equal(SPORTS_LEAGUES.length, 4);
  assert.ok(!SPORTS_LEAGUES.some((league) => ["4351", "4328", "4480", "4387", "4391"].includes(league.id)));
  assert.equal(new Set(SPORTS_LEAGUES.map((league) => league.id)).size, SPORTS_LEAGUES.length);
});

test("supports the preserved validated official iframe providers", () => {
  assert.deepEqual(SPORTS_VIDEO_PROVIDERS.map((provider) => provider.id), [
    "youtube", "twitch", "dailymotion", "vimeo",
  ]);

  const examples = [
    ["https://www.youtube.com/watch?v=abcDEF_1234", "youtube", "youtube-nocookie.com"],
    ["https://www.twitch.tv/nba", "twitch", "player.twitch.tv"],
    ["https://www.dailymotion.com/video/x84sh87", "dailymotion", "dailymotion.com"],
    ["https://vimeo.com/123456789", "vimeo", "player.vimeo.com"],
  ];
  for (const [url, provider, embedHost] of examples) {
    const source = mapSportsVideoSource(url);
    assert.equal(source?.providerId, provider);
    assert.equal(new URL(source?.embedUrl || "https://invalid.local").hostname.endsWith(embedHost), true);
  }
});

test("rejects unsupported, insecure and lookalike sports embeds", () => {
  assert.equal(mapSportsVideoSource("http://www.youtube.com/watch?v=abcDEF_1234"), null);
  assert.equal(mapSportsVideoSource("https://youtube.example.com/watch?v=abcDEF_1234"), null);
  assert.equal(mapSportsVideoSource('<iframe src="https://vimeo.com.attacker.example/embed/1"></iframe>'), null);
});

test("maps past TheSportsDB events to safe YouTube embeds without overstating their origin", () => {
  const event = mapSportsDbEvent({
    idEvent: "42",
    strEvent: "Time A vs Time B",
    strLeague: "Liga",
    strSport: "Soccer",
    strTimestamp: "2026-08-23T19:00:00",
    strVideo: "https://www.youtube.com/watch?v=abcDEF_1234",
    intHomeScore: "2",
    intAwayScore: "1",
  }, "past");

  assert.equal(event?.status, "replay");
  assert.equal(event?.sport, "Futebol");
  assert.equal(event?.embedUrl, "https://www.youtube-nocookie.com/embed/abcDEF_1234?rel=0");
  assert.equal(event?.sourceName, "YouTube · via TheSportsDB");
  assert.equal(event?.homeScore, 2);
});

test("maps upcoming events without pretending a stream is available", () => {
  const event = mapSportsDbEvent({
    idEvent: "43",
    strEvent: "Piloto A vs Piloto B",
    strLeague: "Fórmula 1",
    strSport: "Motorsport",
    strTimestamp: "2026-09-01T12:00:00Z",
  }, "upcoming");

  assert.equal(event?.status, "upcoming");
  assert.equal(event?.embedUrl, undefined);
  assert.match(event?.sourceUrl || "", /^https:\/\/www\.thesportsdb\.com\/event\//);
});

test("deduplicates the same event and date across feeds", () => {
  const event = mapSportsDbEvent({
    idEvent: "44",
    strEvent: "Time A vs Time B",
    strLeague: "Liga",
    strSport: "Soccer",
    strTimestamp: "2026-08-23T19:00:00Z",
  }, "past");
  assert.equal(dedupeSportsEvents([event, { ...event, id: "other" }]).length, 1);
});

test("adds authorized providers to an event and promotes a finished event to replay", () => {
  const event = mapSportsDbEvent({
    idEvent: "45",
    strEvent: "Equipe A vs Equipe B",
    strLeague: "NBA",
    strSport: "Basketball",
    strTimestamp: "2026-08-22T19:00:00Z",
  }, "past");
  const withTwitch = addSportsVideoSource(event, "https://www.twitch.tv/nba", "Canal oficial da NBA");
  assert.equal(withTwitch.status, "replay");
  assert.equal(withTwitch.sources.length, 1);
  assert.equal(withTwitch.sources[0].providerId, "twitch");
});
