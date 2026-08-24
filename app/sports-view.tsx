"use client";

import { useEffect, useMemo, useState } from "react";
import type { SportsCatalogResponse, SportsEvent, SportsEventStatus } from "../lib/sports-catalog";
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

export default function SportsView() {
  const [catalog, setCatalog] = useState(EMPTY_CATALOG);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [activeId, setActiveId] = useState("");
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
              {active.embedUrl ? (
                <iframe
                  key={active.embedUrl}
                  className="sports-iframe"
                  src={active.embedUrl}
                  title={`${active.videoLabel || "Vídeo do evento"} — ${active.title}`}
                  allow={PROTECTED_PLAYER_ALLOW}
                  allowFullScreen
                  referrerPolicy={PROTECTED_PLAYER_REFERRER_POLICY}
                  sandbox={PROTECTED_PLAYER_SANDBOX}
                />
              ) : (
                <div
                  className="sports-event-art"
                  style={active.thumbnail ? { backgroundImage: `linear-gradient(180deg, rgba(5, 6, 8, .16), #050608), url(${JSON.stringify(active.thumbnail).slice(1, -1)})` } : undefined}
                >
                  <span className="sports-provider-mark is-large">{sportMark(active.sport)}</span>
                  <strong>{active.status === "upcoming" ? "Transmissão a confirmar" : "Evento encerrado"}</strong>
                  <p>
                    {active.status === "upcoming"
                      ? "O player aparecerá somente se uma fonte oficial liberar a transmissão incorporável."
                      : "Ainda não há replay oficial incorporável para este evento."}
                  </p>
                </div>
              )}
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
                <div><dt>Fonte</dt><dd>{active.sourceName}</dd></div>
              </dl>
              <a className="primary-action" href={active.sourceUrl} target="_blank" rel="noreferrer">
                {active.embedUrl ? "Abrir na fonte" : "Ver detalhes do evento"}
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
                onClick={() => setActiveId(event.id)}
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
                  {event.embedUrl ? <b>Assistir</b> : null}
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
          Agenda e links de vídeo vêm da TheSportsDB. O ScoreBat fornece transmissões e destaques de fontes oficiais;
          o player só aceita embeds HTTPS validados. Direitos, região e disponibilidade continuam sob controle do publicador.
        </p>
      </div>
    </section>
  );
}
