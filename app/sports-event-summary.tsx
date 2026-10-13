"use client";

import { useState } from "react";
import type { SportsEvent } from "../lib/sports-catalog";

export function SportIcon({ sport }: { sport: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {sport === "Basquete" ? <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3v18M5.5 5.5c8 1 12 5 13 13M18.5 5.5c-8 1-12 5-13 13" /></>
        : sport === "Futebol" ? <><circle cx="12" cy="12" r="9" /><path d="m12 7 5 4-2 6H9l-2-6 5-4ZM12 3v4m9 5-4-1m1 8-3-2m-9 2 3-2m-6-5 4-1" /></>
        : sport === "Futebol americano" ? <><ellipse cx="12" cy="12" rx="10" ry="6" transform="rotate(-35 12 12)" /><path d="m8 15 8-6m-6 1 3 4m-5-2 3 4m1-8 3 4" /></>
        : sport === "all" ? <><rect x="3" y="3" width="7" height="7" rx="2" /><rect x="14" y="3" width="7" height="7" rx="2" /><rect x="3" y="14" width="7" height="7" rx="2" /><rect x="14" y="14" width="7" height="7" rx="2" /></>
        : <><path d="M8 3h8v5a4 4 0 0 1-8 0V3ZM8 5H4v2a4 4 0 0 0 4 4m8-6h4v2a4 4 0 0 1-4 4M12 12v6m-5 3h10m-8-3h6v3" /></>}
    </svg>
  );
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join("").toLocaleUpperCase("pt-BR");
}

function TeamBadge({ name, url }: { name: string; url?: string }) {
  const [failedUrl, setFailedUrl] = useState("");
  const showImage = Boolean(url && url !== failedUrl);
  return (
    <span className={`sports-team-monogram ${showImage ? "has-image" : ""}`} aria-hidden="true">
      {showImage ? (
        // Team badges use the provider's verified image endpoint and need per-image fallback.
        // eslint-disable-next-line @next/next/no-img-element
        <img className="sports-team-badge" src={url} alt="" width={26} height={26} loading="lazy" decoding="async" onError={() => setFailedUrl(url || "")} />
      ) : initials(name)}
    </span>
  );
}

/** Real provider badges where available; monograms remain the fallback for missing/broken images. */
export function SportsEventTeams({ event }: { event: SportsEvent }) {
  if (!event.homeTeam || !event.awayTeam) return <span className="sports-match-title"><strong>{event.title}</strong><small>{event.sport}</small></span>;
  return (
    <span className="sports-team-lines">
      {[{ name: event.homeTeam, score: event.homeScore, badge: event.homeBadge }, { name: event.awayTeam, score: event.awayScore, badge: event.awayBadge }].map((team, index) => (
        <span className="sports-team-line" key={index}>
          <TeamBadge name={team.name} url={team.badge} />
          <span className="sports-team-name">{team.name}</span>
          {typeof team.score === "number" ? <b className="sports-team-score">{team.score}</b> : null}
        </span>
      ))}
    </span>
  );
}
