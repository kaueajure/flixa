"use client";

import { useEffect, useMemo, useState } from "react";

export type LibraryMovie = {
  id: string; tmdb_id?: string; imdb_id?: string; kind?: "movie" | "tv"; title: string; poster: string; backdrop: string;
  year?: number; genres: string[]; rating?: string; duration?: string; durationSeconds?: number; addedAt?: string;
  libraryState?: "quero_assistir" | "assistindo" | "concluido" | "abandonado"; favorite?: boolean; notForMe?: boolean;
  collections?: Array<{ id: number; name: string }>;
};
type Collection = { id: number; name: string };
const STATES = [
  ["all", "Todos"], ["quero_assistir", "Quero assistir"], ["assistindo", "Assistindo"], ["concluido", "Concluídos"], ["abandonado", "Abandonei"], ["favorite", "Favoritos"], ["not_for_me", "Não é para mim"],
] as const;
const STATE_LABEL = { quero_assistir: "Quero assistir", assistindo: "Assistindo", concluido: "Concluído", abandonado: "Abandonei" };
function key(movie: LibraryMovie) { return movie.kind === "tv" ? `tv:${movie.tmdb_id || movie.id}` : movie.tmdb_id || movie.imdb_id || movie.id; }
function minutes(movie: LibraryMovie) { if (movie.durationSeconds) return movie.durationSeconds / 60; const match = movie.duration?.match(/(?:(\d+)h)?\s*(\d+)?/); return match ? Number(match[1] || 0) * 60 + Number(match[2] || 0) : 0; }

export default function LibraryView({ items, onItemsChange, onOpen, onExplore }: { items: LibraryMovie[]; onItemsChange: (items: LibraryMovie[]) => void; onOpen: (movie: LibraryMovie) => void; onExplore: () => void }) {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [state, setState] = useState("all"); const [kind, setKind] = useState("all"); const [genre, setGenre] = useState("all"); const [year, setYear] = useState("all"); const [duration, setDuration] = useState("all"); const [sort, setSort] = useState("recent"); const [collection, setCollection] = useState("all");
  const [editing, setEditing] = useState<LibraryMovie | null>(null); const [newCollection, setNewCollection] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => { fetch("/api/lista", { cache: "no-store", credentials: "include" }).then((r) => r.ok ? r.json() : null).then((data) => { if (data?.itens) onItemsChange(data.itens); if (data?.colecoes) setCollections(data.colecoes); }); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const genres = useMemo(() => [...new Set(items.flatMap((item) => item.genres || []))].sort((a, b) => a.localeCompare(b, "pt-BR")), [items]);
  const years = useMemo(() => [...new Set(items.map((item) => item.year).filter(Boolean) as number[])].sort((a, b) => b - a), [items]);
  const visible = useMemo(() => items.filter((item) => {
    if (state === "favorite" && !item.favorite) return false; if (state === "not_for_me" && !item.notForMe) return false;
    if (!['all','favorite','not_for_me'].includes(state) && (item.libraryState || "quero_assistir") !== state) return false;
    if (kind !== "all" && (item.kind === "tv" ? "tv" : "movie") !== kind) return false;
    if (genre !== "all" && !item.genres?.includes(genre)) return false; if (year !== "all" && item.year !== Number(year)) return false;
    const runtime = minutes(item); if (duration === "short" && (!runtime || runtime > 90)) return false; if (duration === "medium" && (runtime <= 90 || runtime > 120)) return false; if (duration === "long" && runtime <= 120) return false;
    if (collection !== "all" && !item.collections?.some((entry) => entry.id === Number(collection))) return false; return true;
  }).sort((a, b) => sort === "rating" ? Number(b.rating || 0) - Number(a.rating || 0) : sort === "duration-asc" ? minutes(a) - minutes(b) : sort === "year" ? Number(b.year || 0) - Number(a.year || 0) : String(b.addedAt || "").localeCompare(String(a.addedAt || ""))), [items, state, kind, genre, year, duration, sort, collection]);

  async function patch(movie: LibraryMovie, change: Record<string, unknown>) {
    setBusy(true); const response = await fetch("/api/lista", { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chave: key(movie), ...change }) });
    const data = await response.json(); if (response.ok && data.item) onItemsChange(items.map((item) => key(item) === key(movie) ? { ...item, ...data.item, collections: item.collections } : item)); setBusy(false);
  }
  async function saveCollections(movie: LibraryMovie, ids: number[]) {
    setBusy(true); const response = await fetch("/api/lista/colecoes", { method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chave: key(movie), collectionIds: ids }) });
    if (response.ok) onItemsChange(items.map((item) => key(item) === key(movie) ? { ...item, collections: collections.filter((entry) => ids.includes(entry.id)) } : item)); setBusy(false);
  }
  async function createCollection() {
    if (newCollection.trim().length < 2) return; const response = await fetch("/api/lista/colecoes", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nome: newCollection }) }); const data = await response.json(); if (response.ok && data.colecao) { setCollections((current) => [data.colecao, ...current]); setNewCollection(""); }
  }
  async function remove(movie: LibraryMovie) { const response = await fetch(`/api/lista?chave=${encodeURIComponent(key(movie))}`, { method: "DELETE", credentials: "include" }); if (response.ok) { onItemsChange(items.filter((item) => key(item) !== key(movie))); setEditing(null); } }

  return <section className="library-view" id="minha-lista">
    <header className="library-hero"><div><p className="eyebrow">Sua biblioteca</p><h1>Minha Lista</h1><p>{items.length} {items.length === 1 ? "história organizada" : "histórias organizadas"} do seu jeito.</p></div><button className="secondary-action" onClick={onExplore}>Explorar catálogo</button></header>
    <div className="library-state-tabs">{STATES.map(([id,label]) => <button key={id} className={state === id ? "is-active" : ""} onClick={() => setState(id)}>{label}<span>{id === "all" ? items.length : id === "favorite" ? items.filter(i=>i.favorite).length : id === "not_for_me" ? items.filter(i=>i.notForMe).length : items.filter(i=>(i.libraryState||"quero_assistir")===id).length}</span></button>)}</div>
    <div className="library-toolbar"><select value={kind} onChange={(e)=>setKind(e.target.value)} aria-label="Tipo"><option value="all">Filmes e séries</option><option value="movie">Filmes</option><option value="tv">Séries</option></select><select value={genre} onChange={(e)=>setGenre(e.target.value)} aria-label="Gênero"><option value="all">Todos os gêneros</option>{genres.map(g=><option key={g}>{g}</option>)}</select><select value={year} onChange={(e)=>setYear(e.target.value)} aria-label="Ano"><option value="all">Todos os anos</option>{years.map(y=><option key={y}>{y}</option>)}</select><select value={duration} onChange={(e)=>setDuration(e.target.value)} aria-label="Duração"><option value="all">Qualquer duração</option><option value="short">Até 90 min</option><option value="medium">91 a 120 min</option><option value="long">Mais de 2 horas</option></select><select value={collection} onChange={(e)=>setCollection(e.target.value)} aria-label="Coleção"><option value="all">Todas as coleções</option>{collections.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select><select value={sort} onChange={(e)=>setSort(e.target.value)} aria-label="Ordenar"><option value="recent">Adicionados recentemente</option><option value="rating">Melhor nota</option><option value="year">Mais novos</option><option value="duration-asc">Menor duração</option></select></div>
    {visible.length ? <div className="library-grid">{visible.map((movie)=><article key={key(movie)} className={movie.notForMe ? "is-muted" : ""}><button className="library-poster" onClick={()=>onOpen(movie)}>{movie.poster ? <img src={movie.poster} alt={`Pôster de ${movie.title}`} loading="lazy" /> : <span>{movie.title[0]}</span>}<i>{STATE_LABEL[movie.libraryState || "quero_assistir"]}</i>{movie.favorite ? <b aria-label="Favorito">♥</b> : null}</button><div><strong>{movie.title}</strong><small>{[movie.kind === "tv" ? "Série" : "Filme", movie.year, movie.genres?.[0]].filter(Boolean).join(" · ")}</small><button onClick={()=>setEditing(movie)}>Organizar</button></div></article>)}</div> : <div className="library-empty"><strong>Nenhum título neste filtro</strong><span>Ajuste os filtros ou descubra algo novo.</span><button className="primary-action" onClick={onExplore}>Explorar</button></div>}
    {editing ? <div className="library-editor-backdrop" onMouseDown={(e)=>{if(e.target===e.currentTarget)setEditing(null)}}><section className="library-editor" role="dialog" aria-modal="true"><header><div><small>Organizar na biblioteca</small><h2>{editing.title}</h2></div><button onClick={()=>setEditing(null)} aria-label="Fechar">×</button></header><label>Estado<select value={editing.libraryState || "quero_assistir"} disabled={busy} onChange={(e)=>{const value=e.target.value as LibraryMovie['libraryState']; setEditing({...editing,libraryState:value}); void patch(editing,{estado:value});}}>{Object.entries(STATE_LABEL).map(([id,label])=><option value={id} key={id}>{label}</option>)}</select></label><div className="library-editor-toggles"><button className={editing.favorite ? "is-on" : ""} disabled={busy} onClick={()=>{const value=!editing.favorite;setEditing({...editing,favorite:value,notForMe:value?false:editing.notForMe});void patch(editing,{favorito:value})}}>♥ Favorito</button><button className={editing.notForMe ? "is-on is-negative" : ""} disabled={busy} onClick={()=>{const value=!editing.notForMe;setEditing({...editing,notForMe:value,favorite:value?false:editing.favorite});void patch(editing,{naoEParaMim:value})}}>Não é para mim</button></div><fieldset><legend>Listas personalizadas</legend>{collections.map(c=>{const checked=editing.collections?.some(x=>x.id===c.id)||false;return <label key={c.id}><input type="checkbox" checked={checked} onChange={()=>{const ids=checked ? (editing.collections||[]).filter(x=>x.id!==c.id).map(x=>x.id) : [...(editing.collections||[]).map(x=>x.id),c.id];const next={...editing,collections:collections.filter(x=>ids.includes(x.id))};setEditing(next);void saveCollections(editing,ids)}} />{c.name}</label>})}<div className="library-new-collection"><input value={newCollection} onChange={(e)=>setNewCollection(e.target.value.slice(0,60))} placeholder="Nova lista, ex: Terror de sexta"/><button onClick={()=>void createCollection()}>Criar</button></div></fieldset><button className="library-remove" onClick={()=>void remove(editing)}>Remover da biblioteca</button></section></div> : null}
  </section>;
}
