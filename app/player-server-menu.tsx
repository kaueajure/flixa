"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export default function PlayerServerMenu({
  sources,
  activeId,
  onSelect,
  onOpenChange,
  compact = false,
}: {
  sources: { id: string; name: string; theme: string }[];
  activeId: string;
  onSelect: (id: string) => void;
  onOpenChange?: (open: boolean) => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const menuRef = useRef<HTMLDivElement | null>(null);
  const active = sources.find((source) => source.id === activeId) ?? sources[0];
  const normalizedQuery = query.trim().toLocaleLowerCase("pt-BR");
  const visibleSources = normalizedQuery
    ? sources.filter((source) => source.name.toLocaleLowerCase("pt-BR").includes(normalizedQuery))
    : sources;

  const updateOpen = useCallback((next: boolean) => {
    setOpen(next);
    if (!next) setQuery("");
    onOpenChange?.(next);
  }, [onOpenChange]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) updateOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") updateOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, updateOpen]);

  useEffect(() => () => onOpenChange?.(false), [onOpenChange]);

  if (!active || sources.length === 0) return null;

  return (
    <div
      className={`player-server-menu theme-${active.theme} ${open ? "is-open" : ""} ${compact ? "is-compact" : ""}`}
      ref={menuRef}
    >
      <button
        type="button"
        className="player-server-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Servidor: ${active.name}`}
        onClick={() => updateOpen(!open)}
      >
        <span className="player-server-icon" aria-hidden="true">
          <i /><i /><i />
        </span>
        <span className="player-server-copy">
          <small>Servidor ativo</small>
          <strong>{active.name}</strong>
        </span>
        <span className="player-server-count" aria-label={`${sources.length} servidores`}>
          {sources.length}
        </span>
        <span className="player-server-chevron" aria-hidden="true" />
      </button>

      {open ? (
        <div className="player-server-dropdown" role="dialog" aria-label="Alterar servidor">
          <div className="player-server-heading">
            <span>
              <strong>Alterar servidor</strong>
              <small>Escolha outra fonte de reprodução</small>
            </span>
            <em>{sources.length}</em>
          </div>
          <label className="player-server-filter">
            <span aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar servidor"
              aria-label="Buscar servidor"
              autoFocus
            />
          </label>
          <div className="player-server-list" role="group" aria-label="Servidores disponíveis">
            {visibleSources.map((source, index) => {
              const selected = source.id === active.id;
              return (
                <button
                  key={source.id}
                  type="button"
                  aria-pressed={selected}
                  className={`player-server-option theme-${source.theme} ${selected ? "is-active" : ""}`}
                  onClick={() => {
                    onSelect(source.id);
                    updateOpen(false);
                  }}
                >
                  <span className="player-server-rank" aria-hidden="true">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="player-server-dot" aria-hidden="true" />
                  <span className="player-server-copy">
                    <strong>{source.name}</strong>
                    <small>{selected ? "Reproduzindo agora" : "Disponível"}</small>
                  </span>
                  {selected
                    ? <span className="player-server-active-label">Em uso</span>
                    : <span className="player-server-arrow" aria-hidden="true">›</span>}
                </button>
              );
            })}
            {!visibleSources.length ? <p className="player-server-empty">Nenhum servidor encontrado.</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

