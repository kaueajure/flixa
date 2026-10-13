import assert from "node:assert/strict";
import test from "node:test";
import { mapStreamedMatch, mapSportsDbEvent } from "../lib/sports-catalog.ts";
import { eventLeagueId, filterSportsEvents, groupSportsEvents, sportsLeagueOptions } from "../lib/sports-filters.ts";

const liveIds = new Set(["nba-live", "football-live"]);
const match = (id, category, sourceId) => mapStreamedMatch({ id, category, title: id, date: 1791932400000, sources: [{ source: "hotel", id: sourceId }] }, liveIds, 0);
const events = [
  match("nba-live", "basketball", "new-york-knicks-vs-toronto-raptors-nba-1791932400"),
  match("nba-upcoming", "basketball", "teams-nba-1791932400"),
  match("basket-unknown", "basketball", "2285"),
  match("football-live", "football", "sabah-fk-vs-slavia-prague-uefa-champions-league-1791909900"),
  mapSportsDbEvent({ idEvent: "nhl", strEvent: "Hockey", strSport: "Ice Hockey", strLeague: "NHL" }, "past"),
];

test("recognizes leagues only from explicit returned labels, retaining unknown events", () => {
  assert.equal(events[0].league, "NBA");
  assert.equal(events[3].league, "UEFA Champions League");
  assert.equal(events[4].league, "NHL");
  assert.equal(events[2].league, undefined);
  assert.equal(mapStreamedMatch({ id: "nfl", title: "NFL Network", category: "american-football", date: 0 }, new Set()).league, "NFL");
  assert.equal(mapStreamedMatch({ id: "nba-looking", title: "Lakers vs Knicks", category: "basketball" }, new Set()).league, undefined);
  assert.equal(mapStreamedMatch({ id: "fake", title: "NBAmazing", category: "basketball" }, new Set()).league, undefined);
});

test("combines sport, league and live status without mixing unrelated events", () => {
  assert.deepEqual(filterSportsEvents(events, { sport: "Basquete", league: eventLeagueId(events[0]), status: "live" }).map((event) => event.id), [events[0].id]);
  assert.equal(filterSportsEvents(events, { sport: "Basquete", league: "all", status: "all" }).length, 3);
  assert.equal(filterSportsEvents(events, { sport: "all", league: "all", status: "live" }).length, 2);
  assert.deepEqual(filterSportsEvents(events, { sport: "Hóquei no gelo", league: "all", status: "past" }).map((event) => event.id), [events[4].id]);
  assert.equal(filterSportsEvents(events, { sport: "Futebol", league: eventLeagueId(events[0]), status: "all" }).length, 0);
});

test("league options and groups keep unknown leagues separate for each sport", () => {
  const basketball = sportsLeagueOptions(events, "Basquete");
  assert.deepEqual(basketball.map((league) => league.name).sort(), ["Liga não informada", "NBA"]);
  const groups = groupSportsEvents(events);
  assert.equal(groups.length, 4);
  assert.equal(groups.find((group) => group.league === "NBA").events.length, 2);
  const unknownFootball = match("unknown-football", "football", "1860");
  assert.notEqual(eventLeagueId(unknownFootball), eventLeagueId(events[2]));
  assert.equal(groupSportsEvents([unknownFootball, events[2]]).length, 2);
  assert.deepEqual(sportsLeagueOptions([], "all"), []);
});

test("searches titles, teams and leagues while respecting sport/status filters", () => {
  assert.equal(filterSportsEvents(events, { sport: "all", league: "all", status: "all", query: "Champions" }).length, 1);
  assert.equal(filterSportsEvents(events, { sport: "Basquete", league: "all", status: "live", query: "nba" }).length, 1);
  assert.equal(filterSportsEvents(events, { sport: "Futebol", league: "all", status: "all", query: "NBA" }).length, 0);
  const accented = { ...events[0], title: "São Paulo vs Brasília", homeTeam: "São Paulo", awayTeam: "Brasília" };
  assert.equal(filterSportsEvents([accented], { sport: "all", league: "all", status: "all", query: "  brasilia " }).length, 1);
  assert.equal(filterSportsEvents(events, { sport: "all", league: "all", status: "all", query: "inexistente" }).length, 0);
});
