import type { SportsEvent } from "./sports-catalog.ts";

export type SportsStatusFilter = "all" | "live" | "upcoming" | "past";
export type SportsFilters = { sport: string; league: string; status: SportsStatusFilter; query?: string };

export function eventLeague(event: SportsEvent) {
  return event.league || "Liga não informada";
}

export function eventLeagueId(event: SportsEvent) {
  return JSON.stringify([event.sport, eventLeague(event)]);
}

export function filterSportsEvents(events: SportsEvent[], filters: SportsFilters) {
  const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
  const query = normalize(filters.query?.trim() || "");
  return events.filter((event) => {
    if (query && !normalize([event.title, event.homeTeam, event.awayTeam, event.sport, eventLeague(event)].filter(Boolean).join(" ")).includes(query)) return false;
    if (filters.sport !== "all" && event.sport !== filters.sport) return false;
    if (filters.league !== "all" && eventLeagueId(event) !== filters.league) return false;
    if (filters.status === "all") return true;
    if (filters.status === "past") return event.status === "replay" || event.status === "finished";
    return event.status === filters.status;
  });
}

export function sportsLeagueOptions(events: SportsEvent[], sport: string) {
  const options = new Map<string, { id: string; name: string; sport: string }>();
  for (const event of events) {
    if (sport !== "all" && event.sport !== sport) continue;
    options.set(eventLeagueId(event), { id: eventLeagueId(event), name: eventLeague(event), sport: event.sport });
  }
  return [...options.values()].sort((a, b) => a.sport.localeCompare(b.sport, "pt-BR") || a.name.localeCompare(b.name, "pt-BR"));
}

export function groupSportsEvents(events: SportsEvent[]) {
  const groups = new Map<string, { id: string; sport: string; league: string; events: SportsEvent[] }>();
  for (const event of events) {
    const id = eventLeagueId(event);
    const group = groups.get(id) || { id, sport: event.sport, league: eventLeague(event), events: [] };
    group.events.push(event);
    groups.set(id, group);
  }
  return [...groups.values()];
}
