"use client";

import { usePageReady } from "./page-loading-boundary";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  type SportsCatalogResponse,
  type SportsEvent,
  type SportsEventStatus,
  type SportsVideoSource,
} from "../lib/sports-catalog";
import { SportIcon, SportsEventTeams } from "./sports-event-summary";
import PlayerServerMenu from "./player-server-menu";
import { PlayerSandboxToggle, PlayerSandboxWarning, PlayerSandboxNotice } from "./player-sandbox-controls";
import { eventLeague, filterSportsEvents, groupSportsEvents, sportsLeagueOptions, type SportsStatusFilter } from "../lib/sports-filters";
import {
  PROTECTED_PLAYER_ALLOW,
  PROTECTED_PLAYER_REFERRER_POLICY,
  PROTECTED_PLAYER_SANDBOX,
} from "../lib/player-frame-policy";

type Filter = SportsStatusFilter;

const EMPTY_CATALOG: SportsCatalogResponse = {
  events: [],
  errors: [],
  updatedAt: "",
  liveSourceConfigured: false,
};

const STATUS_LABELS: Record<SportsEventStatus, string> = {
  live: "Ao vivo",
  upcoming: "Em breve",
  replay: "Replay disponível",
  finished: "Encerrado",
  unknown: "Estado não informado",
};

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Todos" },
  { id: "live", label: "Ao vivo" },
  { id: "upcoming", label: "Próximos" },
  { id: "past", label: "Já passaram" },
];

const INITIAL_EVENT_LIMIT = 24;
const EVENT_LIMIT_INCREMENT = 24;
const subscribeToHost = () => () => {};

function eventDate(event: SportsEvent, compact = false) {
  const date = new Date(event.startAt);
  if (Number.isNaN(date.valueOf())) return "Data a confirmar";
  return new Intl.DateTimeFormat("pt-BR", {
    ...(compact ? { day: "2-digit", month: "short" } : { weekday: "long", day: "2-digit", month: "long" }),
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(date);
}

function hasScore(event: SportsEvent) {
  return typeof event.homeScore === "number" && typeof event.awayScore === "number";
}

function sportMark(sport: string) {
  return sport
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 3)
    .toLocaleUpperCase("pt-BR");
}

function eventSources(event: SportsEvent | null) {
  if (!event) return [];
  if (Array.isArray(event.sources) && event.sources.length) return event.sources;
  if (!event.embedUrl) return [];
  return [{
    id: event.embedUrl,
    providerId: "youtube",
    name: event.sourceName,
    sourceUrl: event.sourceUrl,
    embedUrl: event.embedUrl,
    label: event.videoLabel || "Vídeo do evento",
  }] satisfies SportsVideoSource[];
}

function playerUrl(source: SportsVideoSource | null, parent: string) {
  if (!source) return "";
  if (source.providerId !== "twitch") return source.embedUrl;
  if (!parent) return "";
  const url = new URL(source.embedUrl);
  url.searchParams.set("parent", parent);
  return url.toString();
}

export default function SportsView() {
  const [catalog, setCatalog] = useState(EMPTY_CATALOG);
  const [loading, setLoading] = useState(true);
  usePageReady(!loading);
  const [failure, setFailure] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedSport, setSelectedSport] = useState("all");
  const [selectedLeague, setSelectedLeague] = useState("all");
  const [query, setQuery] = useState("");
  const [sidebarTab, setSidebarTab] = useState<"events" | "details">("events");
  const [agendaLimit, setAgendaLimit] = useState(12);
  const [unprotectedEventId, setUnprotectedEventId] = useState("");
  const [sandboxWarningFor, setSandboxWarningFor] = useState("");
  const stageRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [playbackNotice, setPlaybackNotice] = useState("");
  const [activeId, setActiveId] = useState("");
  const [activeSourceId, setActiveSourceId] = useState("");
  const embedParent = useSyncExternalStore(
    subscribeToHost,
    () => window.location.hostname,
    () => "",
  );
  const [eventLimit, setEventLimit] = useState(INITIAL_EVENT_LIMIT);

  const [streamState, setStreamState] = useState<{ eventId: string; sources: SportsVideoSource[]; errors: string[] }>({ eventId: "", sources: [], errors: [] });
  const [streamsLoading, setStreamsLoading] = useState(false);
  const [streamRetry, setStreamRetry] = useState(0);
  const [playerAttempt, setPlayerAttempt] = useState(0);
  const [playerState, setPlayerState] = useState<{ url: string; status: "loading" | "loaded" | "failed" }>({ url: "", status: "loading" });

  useEffect(() => {
    let disposed = false;
    let pending = false;
    const controller = new AbortController();
    async function refresh() {
      if (pending || document.visibilityState === "hidden") return;
      pending = true;
      try {
        const response = await fetch("/api/sports", { cache: "no-store", signal: controller.signal });
        const data = await response.json() as SportsCatalogResponse;
        if (!response.ok || !Array.isArray(data.events)) throw new Error("O catálogo esportivo está temporariamente indisponível.");
        if (!disposed) {
          setCatalog({ ...EMPTY_CATALOG, ...data });
          setActiveId((current) => current || data.events[0]?.id || "");
          setFailure("");
        }
      } catch (error) {
        if (!disposed) setFailure(error instanceof Error ? error.message : "Não foi possível carregar os eventos.");
      } finally {
        pending = false;
        if (!disposed) setLoading(false);
      }
    }
    void refresh();
    const interval = window.setInterval(() => void refresh(), 60000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      disposed = true;
      controller.abort();
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  const sports = useMemo(() => {
    const available = [...new Set(catalog.events.map((event) => event.sport))];
    const preferred = ["Futebol", "Basquete", "Futebol americano"];
    return available.sort((a, b) => {
      const rank = (sport: string) => preferred.includes(sport) ? preferred.indexOf(sport) : preferred.length;
      return rank(a) - rank(b) || a.localeCompare(b, "pt-BR");
    });
  }, [catalog.events]);
  const leagues = useMemo(() => sportsLeagueOptions(catalog.events, selectedSport), [catalog.events, selectedSport]);
  const visibleEvents = useMemo(
    () => filterSportsEvents(catalog.events, { sport: selectedSport, league: selectedLeague, status: filter, query }),
    [catalog.events, filter, selectedSport, selectedLeague, query],
  );
  const active = useMemo(
    () => visibleEvents.find((event) => event.id === activeId) || visibleEvents[0] || null,
    [activeId, visibleEvents],
  );
  const selectedEventId = active?.id || "";
  const streamedEvent = Boolean(active?.streamRefs);
  const sandboxEnabled = !selectedEventId || unprotectedEventId !== selectedEventId;
  const sandboxWarningOpen = Boolean(selectedEventId && sandboxWarningFor === selectedEventId);
  useEffect(() => {
    const updateFullscreen = () => setIsFullscreen(document.fullscreenElement === stageRef.current);
    document.addEventListener("fullscreenchange", updateFullscreen);
    return () => document.removeEventListener("fullscreenchange", updateFullscreen);
  }, []);
  useEffect(() => {
    if (!streamedEvent || !selectedEventId) return;
    const controller = new AbortController();
    let disposed = false;
    let pending = false;
    async function refreshStreams() {
      if (pending || document.visibilityState === "hidden") return;
      pending = true;
      setStreamsLoading(true);
      try {
        const response = await fetch(`/api/sports/streams?eventId=${encodeURIComponent(selectedEventId)}`, {
          cache: "no-store", signal: controller.signal,
        });
        const data = await response.json();
        if (!response.ok || !Array.isArray(data.sources)) throw new Error("Não foi possível carregar os streams");
        if (!disposed) setStreamState({ eventId: selectedEventId, sources: data.sources, errors: data.errors || [] });
      } catch {
        if (!disposed) setStreamState((previous) => ({
          eventId: selectedEventId,
          sources: previous.eventId === selectedEventId ? previous.sources : [],
          errors: ["Não foi possível atualizar os streams. Tente novamente."],
        }));
      } finally {
        pending = false;
        if (!disposed) setStreamsLoading(false);
      }
    }
    void refreshStreams();
    const interval = window.setInterval(() => void refreshStreams(), 60000);
    document.addEventListener("visibilitychange", refreshStreams);
    return () => {
      disposed = true;
      controller.abort();
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshStreams);
    };
  }, [selectedEventId, streamedEvent, streamRetry]);
  const activeSources = useMemo(() => streamedEvent
    ? streamState.eventId === selectedEventId ? streamState.sources : []
    : eventSources(active), [active, selectedEventId, streamedEvent, streamState]);
  const activeSource = useMemo(
    () => activeSources.find((source) => source.id === activeSourceId) || activeSources[0] || null,
    [activeSourceId, activeSources],
  );
  const activePlayerUrl = playerUrl(activeSource, embedParent);
  useEffect(() => {
    if (!activePlayerUrl) return;
    const timer = window.setTimeout(() => setPlayerState((previous) =>
      previous.url === activePlayerUrl && previous.status !== "loading" ? previous : { url: activePlayerUrl, status: "failed" },
    ), 20000);
    return () => window.clearTimeout(timer);
  }, [activePlayerUrl, playerAttempt, sandboxEnabled]);
  const renderedEvents = useMemo(
    () => visibleEvents.slice(0, eventLimit),
    [eventLimit, visibleEvents],
  );
  const eventGroups = useMemo(() => {
    const groups = groupSportsEvents(renderedEvents);
    if (selectedLeague === "all" && groups.length > 1) {
      return [{ id: "all-events", sport: selectedSport, league: "", events: renderedEvents }];
    }
    return groups;
  }, [renderedEvents, selectedLeague, selectedSport]);
  const liveCount = catalog.events.filter((event) => event.status === "live").length;

  function resetPlaybackSelection(events: SportsEvent[]) {
    setEventLimit(INITIAL_EVENT_LIMIT);
    setAgendaLimit(12);
    setActiveId(events[0]?.id || "");
    setActiveSourceId(eventSources(events[0] || null)[0]?.id || "");
    setUnprotectedEventId("");
    setSandboxWarningFor("");
    setPlaybackNotice("");
  }

  function selectFilter(next: Filter) {
    setFilter(next);
    resetPlaybackSelection(filterSportsEvents(catalog.events, { sport: selectedSport, league: selectedLeague, status: next, query }));
  }

  function selectSport(sport: string) {
    setSelectedSport(sport);
    setSelectedLeague("all");
    resetPlaybackSelection(filterSportsEvents(catalog.events, { sport, league: "all", status: filter, query }));
  }

  function selectLeague(league: string) {
    setSelectedLeague(league);
    resetPlaybackSelection(filterSportsEvents(catalog.events, { sport: selectedSport, league, status: filter, query }));
  }

  function selectEvent(event: SportsEvent) {
    setActiveId(event.id);
    setActiveSourceId(eventSources(event)[0]?.id || "");
    setUnprotectedEventId("");
    setSandboxWarningFor("");
    setPlaybackNotice("");
  }

  function changeSandbox(enabled: boolean) {
    setUnprotectedEventId(enabled ? "" : selectedEventId);
    setSandboxWarningFor("");
    setPlayerState({ url: activePlayerUrl, status: "loading" });
  }

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement === stageRef.current) await document.exitFullscreen();
      else await stageRef.current?.requestFullscreen();
      setPlaybackNotice("");
    } catch {
      setPlaybackNotice("Não foi possível ativar a tela cheia. Você também pode usar o controle do próprio player.");
    }
  }

  function selectNextSource() {
    if (activeSources.length < 2) return;
    const current = Math.max(0, activeSources.findIndex((source) => source.id === activeSource?.id));
    setActiveSourceId(activeSources[(current + 1) % activeSources.length].id);
  }

  return (
    <section className="sports-view sports-broadcast" id="esportes" aria-labelledby="sports-title">
      <div className="sports-hero">
        <div>
          <p className="sports-section-label" id="sports-title">Flixa · Esportes</p>
        </div>
        <div className="sports-hero-actions">
          <label className="sports-search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg>
            <input type="search" value={query} onChange={(event) => { setQuery(event.target.value); setEventLimit(INITIAL_EVENT_LIMIT); setAgendaLimit(12); setUnprotectedEventId(""); setSandboxWarningFor(""); }}
              placeholder="Buscar jogos, times ou ligas" aria-label="Buscar jogos, times ou ligas" />
          </label>
        <span className={`sports-live-pill ${liveCount ? "is-live" : ""}`}>
          <i aria-hidden="true" /> {liveCount ? `${liveCount} ao vivo agora` : "Confira a agenda"}
        </span>
        </div>
      </div>

      <div className="sports-navigation">
        <div className="sports-filters" role="group" aria-label="Selecionar esporte">
          {["all", ...sports].map((sport) => (
            <button key={sport} type="button" aria-pressed={selectedSport === sport}
              className={selectedSport === sport ? "is-active" : ""} onClick={() => selectSport(sport)}>
              <SportIcon sport={sport} />{sport === "all" ? "Todos os esportes" : sport}
              <span>{catalog.events.filter((event) => sport === "all" || event.sport === sport).length}</span>
            </button>
          ))}
        </div>
        <div className="sports-filter-details">
          <div className="sports-filters sports-league-tabs" role="group" aria-label="Selecionar liga">
            <button type="button" aria-pressed={selectedLeague === "all"} className={selectedLeague === "all" ? "is-active" : ""} onClick={() => selectLeague("all")}>
              <SportIcon sport="league" />Todas as ligas
            </button>
            {leagues.map((league) => <button key={league.id} type="button" aria-pressed={selectedLeague === league.id}
              className={selectedLeague === league.id ? "is-active" : ""} onClick={() => selectLeague(league.id)}>
              <SportIcon sport="league" />{selectedSport === "all" ? `${league.sport} · ` : ""}{league.name}
            </button>)}
          </div>
        </div>
        <div className="sports-status-toolbar">
          <div className="sports-filters sports-status-filters" role="group" aria-label="Filtrar por status">
            {FILTERS.map((item) => {
              const count = filterSportsEvents(catalog.events, { sport: selectedSport, league: selectedLeague, status: item.id, query }).length;
              return (
                <button key={item.id} type="button" aria-pressed={filter === item.id}
                  className={filter === item.id ? "is-active" : ""} onClick={() => selectFilter(item.id)}>
                  {item.label}<span>{count}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {failure && catalog.events.length > 0 ? <p role="status">{failure} Exibindo a última atualização disponível.</p> : null}
      {catalog.errors.length ? <p role="status">Atualização parcial: {catalog.errors.join(" · ")}</p> : null}
      {loading ? (
        <div className="sports-loading" aria-live="polite">
          <span /><span /><span />
          <p>Montando a agenda esportiva...</p>
        </div>
      ) : failure && !catalog.events.length ? (
        <div className="sports-empty">
          <strong>Catálogo indisponível</strong>
          <p>{failure}</p>
        </div>
      ) : active ? (
        <>
          <div className="sports-workspace">
            <div className="sports-feature">
              <div className="sports-now-playing">
                <span className="sports-current-icon"><SportIcon sport={active.sport} /></span>
                <div><span>{eventLeague(active)}</span><h2>{active.title}</h2></div>
                {active.status === "live" ? <span className="sports-status is-live">Ao vivo</span> : null}
              </div>
              <div className={`sports-stage ${isFullscreen ? "is-fullscreen" : ""}`} ref={stageRef}>
                <div className="sports-player-toolbar">
                  <PlayerServerMenu
                    sources={activeSources.map((source) => ({ id: source.id, name: source.label, theme: "rose" }))}
                    activeId={activeSource?.id || ""}
                    onSelect={(id) => {
                      setActiveSourceId(id);
                      setPlayerState({ url: playerUrl(activeSources.find((source) => source.id === id) || null, embedParent), status: "loading" });
                    }}
                  />
                  {!activeSources.length ? <span className="sports-server-pending">{streamsLoading ? "Buscando servidores…" : "Nenhum servidor disponível"}</span> : null}
                  <PlayerSandboxToggle enabled={sandboxEnabled} onToggle={() => {
                    if (sandboxEnabled) setSandboxWarningFor(selectedEventId);
                    else changeSandbox(true);
                  }} />
                  <button type="button" className="player-icon-btn player-fs-btn" aria-label={isFullscreen ? "Sair da tela cheia" : "Tela cheia"} onClick={() => void toggleFullscreen()}>⛶</button>
                </div>
                {sandboxWarningOpen ? <PlayerSandboxWarning onCancel={() => setSandboxWarningFor("")} onConfirm={() => changeSandbox(false)} /> : null}
                {!sandboxEnabled ? <PlayerSandboxNotice onEnable={() => changeSandbox(true)} /> : null}
                {activeSource && activePlayerUrl ? (
                  <iframe
                    key={`${selectedEventId}:${activePlayerUrl}:${playerAttempt}:${sandboxEnabled ? "protected" : "unprotected"}`}
                    className="sports-iframe"
                    src={activePlayerUrl}
                    title={`${activeSource.label} — ${active.title}`}
                    allow={PROTECTED_PLAYER_ALLOW}
                    allowFullScreen
                    referrerPolicy={activeSource.providerId === "youtube" || activeSource.providerId === "twitch"
                      ? "strict-origin-when-cross-origin"
                      : PROTECTED_PLAYER_REFERRER_POLICY}
                    sandbox={sandboxEnabled ? PROTECTED_PLAYER_SANDBOX : undefined}
                    onLoad={() => setPlayerState({ url: activePlayerUrl, status: "loaded" })}
                    onError={() => setPlayerState({ url: activePlayerUrl, status: "failed" })}
                  />
                ) : (
                  <div
                    className="sports-event-art"
                    style={active.thumbnail ? { backgroundImage: `linear-gradient(180deg, rgba(5, 6, 8, .16), #050608), url(${JSON.stringify(active.thumbnail).slice(1, -1)})` } : undefined}
                  >
                    <span className="sports-provider-mark is-large">{sportMark(active.sport)}</span>
                    <strong>{active.status === "live" ? "Evento ao vivo — sem vídeo" : active.status === "upcoming" ? "Transmissão a confirmar" : active.status === "unknown" ? "Nenhum stream disponível" : "Evento encerrado"}</strong>
                    <p>
                      {active.status === "live"
                        ? "Nenhum stream foi retornado para esta partida ao vivo."
                        : active.status === "upcoming"
                        ? "A fonte ainda não disponibilizou streams para esta partida."
                        : "Nenhuma transmissão está disponível para este evento no momento."}
                    </p>
                  </div>
                )}
                <div className="sports-player-feedback">
                  {playbackNotice ? <p role="status">{playbackNotice}</p> : null}
                  {streamedEvent && (streamsLoading || streamState.eventId !== selectedEventId) ? <p role="status">Carregando streams...</p> : null}
                  {streamState.eventId === selectedEventId && streamState.errors.length ? <p role="status">{streamState.errors.join(" · ")}</p> : null}
                  {activePlayerUrl && (playerState.url !== activePlayerUrl || playerState.status === "loading") ? <p role="status">Carregando player...</p> : null}
                  {playerState.url === activePlayerUrl && playerState.status === "failed" ? <p role="alert">O player não carregou. Selecione outro stream ou abra na fonte.</p> : null}
                  {activeSource ? <button type="button" className="secondary-action" onClick={() => {
                    setPlayerState({ url: activePlayerUrl, status: "loading" });
                    setPlayerAttempt((current) => current + 1);
                  }}>Recarregar player</button> : null}
                  {activeSource ? <button type="button" className="secondary-action" disabled={activeSources.length < 2} onClick={selectNextSource}>Tentar outro stream</button> : null}
                  {streamedEvent ? <button type="button" className="secondary-action" disabled={streamsLoading && streamState.eventId === selectedEventId} onClick={() => setStreamRetry((current) => current + 1)}>Atualizar streams</button> : null}
                </div>

              </div>

              <div className="sports-feature-info">
                <span>{active.sport} · {eventDate(active)}</span>
                {hasScore(active) ? <span className="sports-current-score">{active.homeScore} × {active.awayScore}</span> : null}
                {activeSource?.sourceUrl || active.sourceUrl ? <a href={activeSource?.sourceUrl || active.sourceUrl} target="_blank" rel="noreferrer">Abrir na fonte <span aria-hidden="true">↗</span></a> : null}
              </div>
            </div>
            <aside className="sports-agenda" aria-label="Agenda de partidas">
              <div className="sports-agenda-tabs" role="group" aria-label="Painel da partida">
                <button type="button" aria-pressed={sidebarTab === "events"} className={sidebarTab === "events" ? "is-active" : ""} onClick={() => setSidebarTab("events")}>Eventos <span>{visibleEvents.length}</span></button>
                <button type="button" aria-pressed={sidebarTab === "details"} className={sidebarTab === "details" ? "is-active" : ""} onClick={() => setSidebarTab("details")}>Detalhes da partida</button>
              </div>
              {sidebarTab === "events" ? <>
                <div className="sports-agenda-heading"><h2>Partidas e transmissões</h2><span>Selecione para assistir</span></div>
                <div className="sports-agenda-list">
                  {visibleEvents.slice(0, agendaLimit).map((event) => (
                    <button type="button" key={event.id} className={`sports-agenda-event ${event.id === active.id ? "is-active" : ""}`}
                      aria-pressed={event.id === active.id} title={event.title} onClick={() => selectEvent(event)}>
                      <span className="sports-agenda-league"><SportIcon sport={event.sport} /><small>{eventLeague(event)}</small></span>
                      <SportsEventTeams event={event} />
                      <span className="sports-agenda-status">
                        {event.status === "live" ? <span className="sports-status is-live">Ao vivo</span> : <small>{eventDate(event, true)}</small>}
                        <span aria-hidden="true">›</span>
                      </span>
                    </button>
                  ))}
                  {agendaLimit < visibleEvents.length ? <button className="sports-agenda-more" type="button" onClick={() => setAgendaLimit((current) => current + 12)}>Mostrar mais partidas</button> : null}
                </div>
              </> : <div className="sports-agenda-details">
                <h2>{active.title}</h2>
                <span className={`sports-status is-${active.status}`}>{STATUS_LABELS[active.status]}</span>
                <SportsEventTeams event={active} />
                <dl className="sports-event-details">
                  <div><dt>Esporte</dt><dd>{active.sport}</dd></div>
                  <div><dt>Liga</dt><dd>{eventLeague(active)}</dd></div>
                  <div><dt>Data</dt><dd>{eventDate(active)}</dd></div>
                  {active.venue ? <div><dt>Local</dt><dd>{active.venue}</dd></div> : null}
                  <div><dt>Fonte</dt><dd>{activeSource?.name || active.sourceName}</dd></div>
                  <div><dt>Streams</dt><dd>{activeSources.length ? `${activeSources.length} disponíveis` : streamsLoading ? "Consultando fontes…" : "Nenhum disponível"}</dd></div>
                </dl>
              </div>}
            </aside>
          </div>

          <div className="sports-catalog-head">
            <div>
              <p className="eyebrow">{FILTERS.find((item) => item.id === filter)?.label}</p>
              <h2 id="sports-catalog-title">Jogos e transmissões</h2><span className="sports-catalog-count">{visibleEvents.length} disponíveis</span>
            </div>
            {catalog.updatedAt ? <small>Atualizado {eventDate({ startAt: catalog.updatedAt } as SportsEvent, true)}</small> : null}
          </div>

          {eventGroups.map((group, index) => (
            <section className="sports-event-group" key={group.id} aria-labelledby={group.league ? `sports-group-${index}` : "sports-catalog-title"}>
              {group.league ? <div className="sports-group-heading">
                <div><p className="eyebrow">{group.sport}</p><h3 id={`sports-group-${index}`}>{group.league}</h3></div>
                <span>{group.events.length} {group.events.length === 1 ? "evento" : "eventos"}</span>
              </div> : null}
              <div className="sports-event-grid">
                {group.events.map((event) => (
                  <button
                    key={event.id}
                    type="button"
                    className={`sports-event-card ${event.id === active.id ? "is-active" : ""}`}
                    title={event.title}
                    aria-pressed={event.id === active.id}
                    onClick={() => selectEvent(event)}
                  >
                    <span className="sports-card-topline"><span><SportIcon sport={event.sport} /><small>{eventLeague(event)}</small></span>
                      {event.status === "live" ? <span className="sports-status is-live">Ao vivo</span> : null}
                    </span>
                    <SportsEventTeams event={event} />
                    <span className="sports-card-footer"><span>{eventDate(event, true)}</span><span>{event.id === active.id ? "Selecionado" : event.streamRefs?.length || eventSources(event).length ? "Ver streams" : event.sport}</span></span>
                  </button>
                ))}
              </div>
            </section>
          ))}
          {renderedEvents.length < visibleEvents.length ? (
            <div className="sports-load-more">
              <button
                type="button"
                className="secondary-action"
                onClick={() => setEventLimit((current) => current + EVENT_LIMIT_INCREMENT)}
              >
                Mostrar mais eventos
              </button>
            </div>
          ) : null}
        </>
      ) : (
        <div className="sports-empty">
          <strong>Nenhum evento nesta seção</strong>
          <p>{query ? "Nenhuma partida corresponde à sua busca. Tente outro time ou liga." : "Não há eventos disponíveis para este filtro."}</p>
          <button type="button" className="secondary-action" onClick={() => { setQuery(""); setSelectedSport("all"); setSelectedLeague("all"); setFilter("all"); resetPlaybackSelection(catalog.events); }}>Limpar filtros</button>
        </div>
      )}

      <p className="sports-source-note">Agenda atualizada automaticamente. A disponibilidade das transmissões depende de cada fonte.</p>
    </section>
  );
}
