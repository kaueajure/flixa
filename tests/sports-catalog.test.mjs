import assert from "node:assert/strict";
import test from "node:test";

import {
  SPORTS_LEAGUES,
  dedupeSportsEvents,
  mapScoreBatEvent,
  mapSportsDbEvent,
} from "../lib/sports-catalog.ts";

test("uses a multi-sport league catalog instead of static stream providers", () => {
  assert.ok(SPORTS_LEAGUES.length > 5);
  assert.equal(new Set(SPORTS_LEAGUES.map((league) => league.id)).size, SPORTS_LEAGUES.length);
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

test("accepts only ScoreBat-owned iframe URLs", () => {
  const base = {
    title: "Clube A - Clube B",
    competition: "Liga",
    date: "2026-08-24T12:00:00+0000",
  };
  const valid = mapScoreBatEvent({
    ...base,
    videos: [{ id: "video-1", title: "Live", embed: '<iframe src="https://www.scorebat.com/embed/v/123/?token=x"></iframe>' }],
  }, "live", new Date("2026-08-24T13:00:00Z"));
  const invalid = mapScoreBatEvent({
    ...base,
    videos: [{ embed: '<iframe src="https://example.com/player"></iframe>' }],
  }, "live", new Date("2026-08-24T13:00:00Z"));

  assert.equal(valid?.status, "live");
  assert.match(valid?.embedUrl || "", /^https:\/\/www\.scorebat\.com\//);
  assert.equal(invalid, null);
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
