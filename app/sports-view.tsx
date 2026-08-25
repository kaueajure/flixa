"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  SPORTS_VIDEO_PROVIDERS,
  type SportsCatalogResponse,
  type SportsEvent,
  type SportsEventStatus,
  type SportsVideoSource,
} from "../lib/sports-catalog";
import {
  PROTECTED_PLAYER_ALLOW,
  PROTECTED_PLAYER_REFERRER_POLICY,
  PROTECTED_PLAYER_SANDBOX,
} from "../lib/player-frame-policy";

type Filter = "all" | "live" | "upcoming" | "past";

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

function matchesFilter(event: SportsEvent, filter: Filter) {
  if (filter === "all") return true;
  if (filter === "past") return event.status === "replay" || event.status === "finished";
  return event.status === filter;
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
  const [failure, setFailure] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [activeId, setActiveId] = useState("");
  const [activeSourceId, setActiveSourceId] = useState("");
  const embedParent = useSyncExternalStore(
    subscribeToHost,
    () => window.location.hostname,
    () => "",
  );
  const [eventLimit, setEventLimit] = useState(INITIAL_EVENT_LIMIT);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/sports", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const data = await response.json() as SportsCatalogResponse;
        if (!response.ok && data.events?.length === 0) throw new Error("O catálogo esportivo está temporariamente indisponível.");
        return data;
      })
      .then((data) => {
        setCatalog({ ...EMPTY_CATALOG, ...data, events: Array.isArray(data.events) ? data.events : [] });
        setActiveId(data.events?.[0]?.id || "");
        setActiveSourceId(eventSources(data.events?.[0] || null)[0]?.id || "");
        setFailure("");
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setFailure(error instanceof Error ? error.message : "Não foi possível carregar os eventos.");
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  const visibleEvents = useMemo(
    () => catalog.events.filter((event) => matchesFilter(event, filter)),
    [catalog.events, filter],
  );
  const active = useMemo(
    () => visibleEvents.find((event) => event.id === activeId) || visibleEvents[0] || null,
    [activeId, visibleEvents],
  );
  const activeSources = useMemo(() => eventSources(active), [active]);
  const activeSource = useMemo(
    () => activeSources.find((source) => source.id === activeSourceId) || activeSources[0] || null,
    [activeSourceId, activeSources],
  );
  const activePlayerUrl = playerUrl(activeSource, embedParent);
  const renderedEvents = useMemo(
    () => visibleEvents.slice(0, eventLimit),
    [eventLimit, visibleEvents],
  );
  const liveCount = catalog.events.filter((event) => event.status === "live").length;

  function selectFilter(next: Filter) {
    setFilter(next);
    setEventLimit(INITIAL_EVENT_LIMIT);
    const first = catalog.events.find((event) => matchesFilter(event, next));
    setActiveId(first?.id || "");
    setActiveSourceId(eventSources(first || null)[0]?.id || "");
  }

  function selectEvent(event: SportsEvent) {
    setActiveId(event.id);
    setActiveSourceId(eventSources(event)[0]?.id || "");
  }

  function selectNextSource() {
    if (activeSources.length < 2) return;
    const current = Math.max(0, activeSources.findIndex((source) => source.id === activeSource?.id));
    setActiveSourceId(activeSources[(current + 1) % activeSources.length].id);
  }

  return (
    <section className="sports-view" id="esportes">
      <div className="sports-hero">
        <div>
          <p className="eyebrow">Agenda e fontes reais</p>
          <h1>Catálogo esportivo</h1>
          <p className="hero-description">
            Eventos futuros, resultados e vídeos informados pelas fontes, organizados em um só lugar.
          </p>
        </div>
        <span className={`sports-live-pill ${liveCount ? "is-live" : ""}`}>
          <i aria-hidden="true" /> {liveCount ? `${liveCount} ao vivo agora` : "Agenda atualizada"}
        </span>
      </div>

      <div className="sports-filters" role="tablist" aria-label="Filtrar eventos">
        {FILTERS.map((item) => {
          const count = catalog.events.filter((event) => matchesFilter(event, item.id)).length;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={filter === item.id}
              className={filter === item.id ? "is-active" : ""}
              onClick={() => selectFilter(item.id)}
            >
              {item.label}<span>{count}</span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="sports-loading" aria-live="polite">
          <span /><span /><span />
          <p>Montando a agenda esportiva...</p>
        </div>
      ) : failure ? (
        <div className="sports-empty">
          <strong>Catálogo indisponível</strong>
          <p>{failure}</p>
        </div>
      ) : active ? (
        <>
          <div className="sports-feature">
            <div className="sports-stage">
              {activeSource && activePlayerUrl ? (
                <iframe
                  key={activePlayerUrl}
                  className="sports-iframe"
                  src={activePlayerUrl}
                  title={`${activeSource.label} — ${active.title}`}
                  allow={PROTECTED_PLAYER_ALLOW}
                  allowFullScreen
                  referrerPolicy={activeSource.providerId === "youtube" || activeSource.providerId === "twitch"
                    ? "strict-origin-when-cross-origin"
                    : PROTECTED_PLAYER_REFERRER_POLICY}
                  sandbox={PROTECTED_PLAYER_SANDBOX}
                  onError={selectNextSource}
                />
              ) : (
                <div
                  className="sports-event-art"
                  style={active.thumbnail ? { backgroundImage: `linear-gradient(180deg, rgba(5, 6, 8, .16), #050608), url(${JSON.stringify(active.thumbnail).slice(1, -1)})` } : undefined}
                >
                  <span className="sports-provider-mark is-large">{sportMark(active.sport)}</span>
                  <strong>{active.status === "live" ? "Evento ao vivo — sem vídeo" : active.status === "upcoming" ? "Transmissão a confirmar" : "Evento encerrado"}</strong>
                  <p>
                    {active.status === "live"
                      ? "A partida está acontecendo, mas nenhuma fonte oficial liberou um player incorporável."
                      : active.status === "upcoming"
                      ? "O player aparecerá somente se uma fonte oficial liberar a transmissão incorporável."
                      : "Ainda não há replay oficial incorporável para este evento."}
                  </p>
                </div>
              )}
              <div className="sports-provider-switcher" aria-label="Servidores de vídeo">
                <span>Servidores</span>
                <div>
                  {SPORTS_VIDEO_PROVIDERS.map((provider) => {
                    const source = activeSources.find((item) => item.providerId === provider.id);
                    return (
                      <button
                        key={provider.id}
                        type="button"
                        disabled={!source}
                        className={source?.id === activeSource?.id ? "is-active" : ""}
                        title={source ? `Usar ${provider.name}` : `${provider.name} não disponibilizou este evento`}
                        onClick={() => source && setActiveSourceId(source.id)}
                      >
                        <i aria-hidden="true" />{provider.name}
                      </button>
                    );
                  })}
                </div>
                <small>{activeSources.length} de {SPORTS_VIDEO_PROVIDERS.length} disponíveis</small>
              </div>
            </div>

            <div className="sports-feature-info">
              <div className="sports-feature-meta">
                <span className={`sports-status is-${active.status}`}>{STATUS_LABELS[active.status]}</span>
                <span>{active.sport}</span>
              </div>
              <p className="sports-competition">{active.competition}</p>
              <h2>{active.title}</h2>
              {hasScore(active) ? (
                <div className="sports-score" aria-label={`Placar ${active.homeScore} a ${active.awayScore}`}>
                  <strong>{active.homeScore}</strong><span>×</span><strong>{active.awayScore}</strong>
                </div>
              ) : null}
              <dl className="sports-event-details">
                <div><dt>Data</dt><dd>{eventDate(active)}</dd></div>
                {active.venue ? <div><dt>Local</dt><dd>{active.venue}</dd></div> : null}
                <div><dt>Fonte</dt><dd>{activeSource?.name || active.sourceName}</dd></div>
              </dl>
              <a className="primary-action" href={activeSource?.sourceUrl || active.sourceUrl} target="_blank" rel="noreferrer">
                {activeSource ? "Abrir na fonte" : "Ver detalhes do evento"}
              </a>
            </div>
          </div>

          <div className="sports-catalog-head">
            <div>
              <p className="eyebrow">{FILTERS.find((item) => item.id === filter)?.label}</p>
              <h2>{visibleEvents.length} {visibleEvents.length === 1 ? "evento" : "eventos"}</h2>
            </div>
            {catalog.updatedAt ? <small>Atualizado {eventDate({ startAt: catalog.updatedAt } as SportsEvent, true)}</small> : null}
          </div>

          <div className="sports-event-grid">
            {renderedEvents.map((event) => (
              <button
                key={event.id}
                type="button"
                className={`sports-event-card ${event.id === active.id ? "is-active" : ""}`}
                onClick={() => selectEvent(event)}
              >
                <span className="sports-event-thumb">
                  {event.thumbnail ? (
                    // As URLs vêm de fontes esportivas variáveis; não podem ser enumeradas no otimizador do Next.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={event.thumbnail}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      fetchPriority="low"
                    />
                  ) : null}
                  {!event.thumbnail ? sportMark(event.sport) : null}
                  <i className={`sports-status is-${event.status}`}>{STATUS_LABELS[event.status]}</i>
                  {eventSources(event).length ? <b>Assistir</b> : null}
                </span>
                <span className="sports-event-copy">
                  <small>{event.competition}</small>
                  <strong>{event.title}</strong>
                  <span>{eventDate(event, true)} · {event.sport}</span>
                </span>
              </button>
            ))}
          </div>
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
          <p>A fonte oficial ainda não publicou eventos para este filtro.</p>
        </div>
      )}

      <div className="sports-note">
        <strong>Fontes verificadas</strong>
        <p>
          Agenda e links de vídeo vêm da TheSportsDB. YouTube, ScoreBat, Twitch, Dailymotion e Vimeo são aceitos
          somente por URLs HTTPS validadas; direitos, região e disponibilidade continuam sob controle do publicador.
        </p>
      </div>
    </section>
  );
}
