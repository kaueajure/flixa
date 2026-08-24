"use client";

import { useEffect, type RefObject } from "react";

type PartySource = {
  id: string;
  name: string;
  src: string;
};

type PartyMedia = {
  id: string;
  title: string;
  kind: "movie" | "tv";
  season?: number;
  episode?: number;
};

export default function WatchPartyControls({
  onOpenChange,
  onSessionProviderChange,
}: {
  media: PartyMedia;
  sources: PartySource[];
  activeSource?: PartySource;
  playerRef: RefObject<HTMLIFrameElement | null>;
  onSelectSource: (id: string) => void;
  onOpenChange?: (open: boolean) => void;
  onSessionProviderChange?: (providerId: string | null) => void;
  providerFailure?: { sourceId: string; reason: string; sequence: number } | null;
}) {
  useEffect(() => {
    onOpenChange?.(false);
    onSessionProviderChange?.(null);

    const url = new URL(window.location.href);
    if (!url.searchParams.has("party")) return;
    url.searchParams.delete("party");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }, [onOpenChange, onSessionProviderChange]);

  return (
    <div className="watch-party is-unavailable">
      <button
        type="button"
        className="player-icon-btn watch-party-trigger is-disabled"
        aria-label="Assistir junto temporariamente indisponível"
        aria-disabled="true"
        disabled
      >
        <span aria-hidden="true">◉</span>
        <small>Inativo</small>
      </button>
    </div>
  );
}
