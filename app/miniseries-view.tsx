"use client";

import { useEffect, useState } from "react";
import { usePageReady } from "./page-loading-boundary";
import MiniEpisodes from "./miniseries-episodes";
import { jsonRequest } from "./miniseries-request";
import { sylnDramaBox } from "../lib/miniseries/authorization";
import { MINISERIES_SETTINGS } from "../lib/miniseries/settings";
import type { Catalog, MiniTitle, TitleDetail } from "../lib/miniseries/types";

function selectedId() { return window.location.hash.match(/^#minisseries\/(mini_[a-z0-9-]{36})$/)?.[1] || ""; }
function Cover({ title }: { title: MiniTitle }) {
  const [failed, setFailed] = useState(false);
  return title.poster && !failed ? <img src={title.poster} alt={`Capa de ${title.title}`} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} /> : <span className="poster-fallback">{title.title}</span>;
}

export default function MiniseriesView({ admin = false }: { admin?: boolean }) {
  const [id, setId] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [genre, setGenre] = useState("");
  const [platform, setPlatform] = useState("");
  const [dramaBoxCategories, setDramaBoxCategories] = useState<{ id: string; name: string }[]>([]);
  const [dramaBoxCategory, setDramaBoxCategory] = useState("");
  const [categoriesBusy, setCategoriesBusy] = useState(false);
  const [lang, setLang] = useState("");
  const [catalog, setCatalog] = useState<Catalog>({ titles: [], page: 1, hasMore: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const normalizedQuery = query.trim().toLocaleLowerCase().replace(/\s+/g, " ");
  const searchTerm = normalizedQuery.length >= 3 ? normalizedQuery : "";
  usePageReady(!loading);

  useEffect(() => {
    const sync = () => setId(selectedId());
    sync(); window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true); setError("");
      jsonRequest<Catalog>(`/api/miniseries?page=${page}${platform ? platform === "reelshort" ? "&provider=reelshort&source=reelshort" : "&platform=dramabox" : ""}${dramaBoxCategory ? `&category=${encodeURIComponent(dramaBoxCategory)}` : ""}${searchTerm ? `&q=${encodeURIComponent(searchTerm)}` : ""}`, { signal: controller.signal })
        .then((r) => { if (!controller.signal.aborted) { setCatalog(r); setError(r.error || ""); } })
        .catch((e) => { if (!controller.signal.aborted) setError(e.message); })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, searchTerm ? 600 : 0);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [searchTerm, page, retry, dramaBoxCategory, platform]);

  const genres = [...new Set(catalog.titles.flatMap((t) => t.genres))].sort();
  const languages = [...new Set(catalog.titles.flatMap((t) => t.languages))].sort();
  const visible = catalog.titles.filter((t) => (!genre || t.genres.includes(genre)) && (!lang || t.languages.includes(lang)) && (!query.trim() || query.trim().length >= 3 || t.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())));
  return <section className="list-view miniseries-view" id="minisseries">
    <div className="list-view-head">
      <div><p className="eyebrow">Histórias em pequenos capítulos</p><h1>Minisséries</h1><p className="hero-description">Uma nova história, episódio por episódio.</p>{catalog.originalPlatforms?.map((p) => <a className="secondary-action" key={p.url} href={p.url} target="_blank" rel="noopener noreferrer">Explorar {p.name} oficial ↗</a>)}</div>
      <label className="mini-search"><span>Buscar minisséries</span><input id="miniseries-search" type="search" maxLength={100} value={query} placeholder="Qual história você procura?" onChange={(e) => { if (id) window.location.hash = "minisseries"; setQuery(e.target.value); setDramaBoxCategory(""); setPage(1); setGenre(""); setLang(""); }} /></label>
    </div>
    {id ? <MiniDetails key={id} id={id} /> : <>
      {<div className="mini-filters"><label>Origem<select value={platform} onChange={(e) => { setPlatform(e.target.value); setDramaBoxCategory(""); setPage(1); setGenre(""); setLang(""); }}><option value="">Todas as fontes</option><option value="dramabox">DramaBox via Syln</option><option value="reelshort">ReelShort direto</option></select></label></div>}
      {catalog.dramaBoxCategoriesAvailable && !platform ? <div className="mini-filters">
        {dramaBoxCategories.length ? <label>Categorias DramaBox<select value={dramaBoxCategory} onChange={(e) => { setDramaBoxCategory(e.target.value); setPage(1); setQuery(""); setGenre(""); setLang(""); }}><option value="">Todo o catálogo</option>{dramaBoxCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label> : <button className="secondary-action" type="button" disabled={categoriesBusy} onClick={async () => { setCategoriesBusy(true); try { const r = await jsonRequest<{ categories: { id: string; name: string }[] }>("/api/miniseries?categories=dramabox"); setDramaBoxCategories(r.categories); if (!r.categories.length) setError("Nenhuma categoria DramaBox disponível."); } catch (e) { setError(e instanceof Error ? e.message : "Categorias indisponíveis."); } finally { setCategoriesBusy(false); } }}>{categoriesBusy ? "Carregando categorias…" : "Explorar categorias DramaBox"}</button>}
      </div> : null}
      {genres.length || languages.length ? <div className="mini-filters">
        {genres.length ? <label>Categoria<select value={genre} onChange={(e) => setGenre(e.target.value)}><option value="">Todas</option>{genres.map((g) => <option key={g}>{g}</option>)}</select></label> : null}
        {languages.length ? <label>Idioma<select value={lang} onChange={(e) => setLang(e.target.value)}><option value="">Todos</option>{languages.map((l) => <option key={l}>{l}</option>)}</select></label> : null}
        <small>Filtros dos títulos desta página</small>
      </div> : null}
      {error ? <div className="mini-notice" role="alert"><p>{error}</p><button className="secondary-action" type="button" onClick={() => setRetry((r) => r + 1)}>Tentar novamente</button></div> : null}
      {loading ? <p role="status">Carregando minisséries…</p> : null}
      {visible.length ? <div className="poster-grid" aria-busy={loading}>{visible.map((title) => <article className="movie-card" key={title.id}>
        <div className="poster-wrap"><a className="poster-hit" href={`#minisseries/${title.id}`} aria-label={`Ver detalhes de ${title.title}`}><span className="poster-frame"><Cover title={title} /></span></a></div>
        <div className="card-meta"><strong>{title.title}</strong><div className="card-tags">{title.refs.some(sylnDramaBox) ? <span>DramaBox · Syln</span> : null}{title.episodeCount ? <span>{title.episodeCount} episódios</span> : null}{title.genres[0] ? <span className="card-genre">{title.genres[0]}</span> : null}{title.year ? <span>{title.year}</span> : null}</div></div>
      </article>)}</div> : !loading ? <div className="mini-empty"><span aria-hidden="true">▤</span><h2>{query.trim() || genre || lang ? "Nenhuma minissérie encontrada" : "Novas histórias estão chegando"}</h2><p>{query.trim() ? "Tente outro título ou ajuste os filtros." : "O catálogo de minisséries ainda está em preparação."}</p></div> : null}
      {page > 1 || catalog.hasMore ? <div className="pager"><button className="secondary-action" type="button" disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}>Anterior</button><span>Página {page}</span><button className="secondary-action" type="button" disabled={!catalog.hasMore || loading} onClick={() => setPage((p) => p + 1)}>Próxima</button></div> : null}
    </>}
    <p className="mini-attribution">DramaBox via Syln identificado nos títulos. Dados de <a href="https://microdramalist.com" target="_blank" rel="noopener noreferrer">MicroDramaList</a> · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0</a>. Informações organizadas para exibição no Flixa.</p>
    {admin ? <MiniDiagnostics onRefresh={() => setRetry((r) => r + 1)} /> : null}
  </section>;
}

function MiniDetails({ id }: { id: string }) {
  const [detail, setDetail] = useState<TitleDetail | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    jsonRequest<TitleDetail>(`/api/miniseries?id=${encodeURIComponent(id)}`, { signal: controller.signal }).then(setDetail).catch((e) => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [id, retry]);
  return <div className="mini-detail">
    <a className="secondary-action" href="#minisseries">‹ Voltar ao catálogo</a>
    {error ? <div className="mini-notice" role="alert"><p>{error}</p><button className="secondary-action" type="button" onClick={() => { setError(""); setRetry((r) => r + 1); }}>Tentar novamente</button></div> : null}
    {!detail && !error ? <p role="status">Carregando detalhes…</p> : null}
    {detail ? <>
      <div className="mini-detail-intro"><div className="mini-detail-cover"><Cover title={detail.title} /></div><div><p className="eyebrow">Minissérie</p><h2>{detail.title.title}</h2><div className="meta-line">{[detail.title.year, detail.title.episodeCount ? `${detail.title.episodeCount} episódios` : "", ...detail.title.languages, ...detail.title.genres].filter(Boolean).map((s) => <span key={s}>{s}</span>)}</div>{detail.title.refs.some(sylnDramaBox) ? <p className="mini-source-help">Origem: DramaBox · Fornecedor técnico: Syln</p> : null}<p className="mini-synopsis">{detail.title.synopsis || "Sinopse ainda não disponível."}</p>
        {detail.title.originals.length ? <div className="details-actions">{detail.title.originals.map((o) => <a className="primary-action" key={o.url} href={o.url} target="_blank" rel="noopener noreferrer">Assistir em {o.platform} ↗</a>)}</div> : detail.title.refs.some((r) => r.provider === "dramabox" || sylnDramaBox(r)) ? <a className="primary-action" href="https://www.dramabox.com/pt" target="_blank" rel="noopener noreferrer">Abrir DramaBox ↗</a> : null}
      </div></div>
      <MiniEpisodes detail={detail} />
    </> : null}
  </div>;
}


function MiniDiagnostics({ onRefresh }: { onRefresh: () => void }) {
  const [result, setResult] = useState(""); const [busy, setBusy] = useState(false);
  const [reelFeed, setReelFeed] = useState("newrelease");
  const [feed, setFeed] = useState("catalog"); const [page, setPage] = useState(1);
  async function run(refresh: boolean, provider: "syln" | "dramabox" = "syln", platform?: "dramabox") {
    setBusy(true);
    try {
      const r = await jsonRequest<unknown>("/api/admin/miniseries", refresh ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "refresh", page: provider === "dramabox" && ["trending", "recommended"].includes(feed) ? 1 : page, provider, platform, feed: provider === "dramabox" ? feed : "catalog" }) } : undefined);
      setResult(JSON.stringify(r, null, 2)); if (refresh) onRefresh();
    } catch (e) { setResult(e instanceof Error ? e.message : "Falha no diagnóstico."); }
    finally { setBusy(false); }
  }
  async function refreshExternal(provider: "reelshort") {
    setBusy(true);
    try {
      const r = await jsonRequest<unknown>("/api/admin/miniseries", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "refreshExternal", provider, platform: "reelshort", feed: reelFeed, page: 1 }) });
      setResult(JSON.stringify(r, null, 2)); onRefresh();
    } catch (e) { setResult(e instanceof Error ? e.message : "Fonte indisponível."); }
    finally { setBusy(false); }
  }
  return <details className="mini-admin"><summary>Administração de Minisséries</summary><p>Atualização controlada do catálogo e diagnóstico das fontes.</p><div className="mini-filters"><label>Lista DramaBox direto<select disabled={!MINISERIES_SETTINGS.enabled.dramabox} value={feed} onChange={(e) => setFeed(e.target.value)}><option value="catalog">Catálogo</option><option value="latest">Lançamentos</option><option value="recommended">Recomendações</option><option value="trending">Populares</option></select></label><label>Página<input type="number" min={1} max={10} value={page} onChange={(e) => setPage(Math.max(1, Math.min(10, Number(e.target.value) || 1)))} /></label></div><div className="details-actions"><button type="button" className="secondary-action" disabled={busy} onClick={() => run(false)}>Ver diagnóstico</button><button type="button" className="secondary-action" disabled={busy} onClick={() => run(true)}>Atualizar catálogo Syln</button><button type="button" className="secondary-action" disabled={busy} onClick={() => run(true, "syln", "dramabox")}>Atualizar DramaBox via Syln</button><button type="button" className="secondary-action" disabled={busy || !MINISERIES_SETTINGS.enabled.dramabox} onClick={() => run(true, "dramabox")}>Atualizar DramaBox direto</button></div><label>Lista ReelShort<select value={reelFeed} onChange={(e) => setReelFeed(e.target.value)}><option value="newrelease">Lançamentos</option><option value="recommended">Recomendações</option><option value="dramadub">Dublados</option></select></label><button type="button" className="secondary-action" disabled={busy} onClick={() => refreshExternal("reelshort")}>Atualizar ReelShort direto</button>{result ? <pre role="status">{result}</pre> : null}</details>;
}
