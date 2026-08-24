"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { SPORTS_PROVIDERS } from "../lib/sports-providers";

export default function SportsView() {
  const [activeId, setActiveId] = useState(SPORTS_PROVIDERS[0]?.id ?? "");
  const active = useMemo(
    () => SPORTS_PROVIDERS.find((provider) => provider.id === activeId) ?? SPORTS_PROVIDERS[0],
    [activeId],
  );

  if (!active) return null;

  return (
    <section className="sports-view" id="esportes">
      <div className="sports-hero">
        <div>
          <p className="eyebrow">Transmissões oficiais</p>
          <h1>Esportes ao vivo</h1>
          <p className="hero-description">
            Cinco fontes oficiais para acompanhar jogos, campeonatos, esportes de ação e eventos olímpicos.
            A disponibilidade depende dos direitos de cada evento e da sua região.
          </p>
        </div>
        <span className="sports-live-pill"><i aria-hidden="true" /> Ao vivo quando disponível</span>
      </div>

      <div className="sports-layout">
        <div className="sports-stage" style={{ "--sports-accent": active.accent } as CSSProperties}>
          <div className="sports-stage-head">
            <span className="sports-provider-mark">{active.shortName}</span>
            <div>
              <small>Fonte selecionada</small>
              <h2>{active.name}</h2>
            </div>
            <span>{active.locale}</span>
          </div>

          {active.embedUrl ? (
            <iframe
              key={active.embedUrl}
              className="sports-iframe"
              src={active.embedUrl}
              title={`Transmissão ao vivo — ${active.name}`}
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
              sandbox="allow-scripts allow-same-origin allow-forms allow-presentation"
            />
          ) : (
            <div className="sports-external-stage">
              <span className="sports-provider-mark is-large">{active.shortName}</span>
              <strong>A programação abre no provedor oficial</strong>
              <p>Este serviço controla a reprodução no próprio site por causa dos direitos de transmissão.</p>
              <a className="primary-action" href={active.officialUrl} target="_blank" rel="noreferrer">
                Abrir {active.name}
              </a>
            </div>
          )}

          <div className="sports-stage-footer">
            <p>{active.description}</p>
            <a className="secondary-action" href={active.officialUrl} target="_blank" rel="noreferrer">
              Ver programação oficial
            </a>
          </div>
        </div>

        <aside className="sports-provider-list" aria-label="Provedores esportivos">
          {SPORTS_PROVIDERS.map((provider) => (
            <button
              key={provider.id}
              type="button"
              className={`sports-provider-card ${provider.id === active.id ? "is-active" : ""}`}
              style={{ "--sports-accent": provider.accent } as CSSProperties}
              aria-pressed={provider.id === active.id}
              onClick={() => setActiveId(provider.id)}
            >
              <span className="sports-provider-mark">{provider.shortName}</span>
              <span>
                <strong>{provider.name}</strong>
                <small>{provider.sports.join(" · ")}</small>
              </span>
              <i aria-hidden="true">›</i>
            </button>
          ))}
        </aside>
      </div>

      <div className="sports-note">
        <strong>Sobre as transmissões</strong>
        <p>
          O Flixa não retransmite nem hospeda o sinal. O player usa a incorporação oficial quando permitida;
          bloqueios por país, assinatura ou evento continuam sendo definidos pelo detentor dos direitos.
        </p>
      </div>
    </section>
  );
}
