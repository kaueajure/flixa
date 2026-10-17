import { MicroDramaList } from "./providers/microdramalist.ts";
import { ReelShort, type ReelShortFeed } from "./providers/reelshort.ts";
import { Syln } from "./providers/syln.ts";
import { DramaBox, DRAMABOX_CAPABILITIES, DRAMABOX_ORIGINAL_SITE, withDramaBoxReferences, preferPortugueseDramaBox, type DramaBoxFeed } from "./providers/dramabox.ts";
import { cacheId, mergeTitles, sameProduction, textKey } from "./normalize.ts";
import { configured, publicTitle, sourceStatus, type MiniConfig } from "./policy.ts";
import { MiniTransport, providerBudget, type Diagnostic } from "./transport.ts";
import { MiniError, isProvider, sourceKey, sameReference, type MiniTitle, type SourceRef, type Catalog, type TitleDetail } from "./types.ts";
import type { MiniStore } from "./store.ts";

export class MiniService {
  store: MiniStore; config: MiniConfig; transport: MiniTransport;
  reelshort: ReelShort; micro: MicroDramaList; syln: Syln; dramaBox: DramaBox;
  plays = new Map<string, Promise<unknown>>();
  constructor(store: MiniStore, config: MiniConfig, transport = new MiniTransport(store)) {
    this.store = store; this.config = config; this.transport = transport;
    this.micro = new MicroDramaList(transport); this.syln = new Syln(transport, config.sylnToken);
    this.dramaBox = new DramaBox(transport, config);
    this.reelshort = new ReelShort(transport);
  }
  decorate(title: MiniTitle) {
    title = { ...title, refs: title.refs.filter((r) => isProvider(r.provider)) };
    return this.config.enabled.dramabox && this.config.enabled.microdramalist ? withDramaBoxReferences(title) : title;
  }
  allowed(provider: SourceRef["provider"]) {
    if (!configured(this.config, provider)) throw new MiniError("Fonte desativada ou aguardando credenciais.");
  }
  async ingest(items: MiniTitle[]) {
    const owner = crypto.randomUUID();
    if (!await this.store.lease("catalog:write", owner, 30000)) throw new MiniError("Atualização de catálogo em andamento.");
    try {
      const all = await this.store.titles(); const saved: MiniTitle[] = [];
      for (const incoming of items) {
        const matches = all.filter((t) => sameProduction(t, incoming));
        // An ambiguous match needs review; do not collapse conflicting editions.
        if (matches.length > 1) {
          const strong = (t: MiniTitle) => t.refs.some((r) => incoming.refs.some((s) => sameReference(r, s))) || Object.entries(t.externalIds).some(([k, v]) => incoming.externalIds[k] === v);
          const conflict = matches.some((a) => matches.some((b) => Object.entries(a.externalIds).some(([k, v]) => b.externalIds[k] && b.externalIds[k] !== v)));
          if (conflict || !matches.every(strong)) throw new MiniError("Correspondência ambígua: revisão manual necessária.", 409);
        }
        let merged = matches[0] || { ...incoming, id: `mini_${crypto.randomUUID()}` };
        for (const other of matches.slice(1)) merged = mergeTitles(merged, other);
        merged = this.decorate(mergeTitles(merged, incoming));
        const absorbed = matches.slice(1).map((t) => t.id);
        await this.store.save(merged, absorbed);
        for (const m of matches) all.splice(all.findIndex((t) => t.id === m.id), 1);
        all.push(merged); saved.push(merged);
      }
      return saved;
    } finally { await this.store.release("catalog:write", owner); }
  }
  async catalog(query = "", page = 1, category?: string, platform?: "dramabox"): Promise<Catalog> {
    const q = textKey(query);
    if (platform) return this.catalogSylnDramaBox(q, page);
    if (q.length >= 3 && configured(this.config, "syln")) {
      const indexed = await this.readSylnSearch(q, page);
      if (indexed) return indexed;
      if (page > 1) {
        const previous = await this.readSylnSearch(q, page - 1);
        if (previous?.hasMore) return this.searchSylnDramaBox(q, page);
      }
    }
    const dramaBoxEnabled = configured(this.config, "dramabox");
    if (q.length >= 3 && dramaBoxEnabled) {
      const index = await this.store.get<{ ids: string[]; hasMore: boolean }>(`dramabox:search-index:${await cacheId(q)}:${page}`);
      if (index && index.expiresAt > Date.now()) {
        const stored = await Promise.all(index.value.ids.map((id) => this.store.title(id)));
        if (stored.every((t) => !!t)) return { titles: stored.map((t) => publicTitle(this.config, this.decorate(t!))).filter((t): t is MiniTitle => !!t), page, hasMore: index.value.hasMore, dramaBoxCategoriesAvailable: true };
      }
      if (page > 1) {
        const previous = await this.store.get<{ hasMore: boolean }>(`dramabox:search-index:${await cacheId(q)}:${page - 1}`);
        if (previous && previous.expiresAt > Date.now() && previous.value.hasMore) return this.searchDramaBox(q, page);
      }
    }
    if (category) {
      this.allowed("dramabox");
      const result = await this.dramaBox.getBooksByCategory(category, page);
      const published = await this.publishDramaBox(result, `category:${category}:${page}`);
      return { titles: published.map((t) => publicTitle(this.config, t)).filter((t): t is MiniTitle => !!t), page, hasMore: result.hasMore, dramaBoxCategoriesAvailable: true };
    }
    let discoveryError: string | undefined;
    if (!q && page === 1 && dramaBoxEnabled) {
      const published = await this.store.get(`dramabox:published:${await cacheId("catalog:1")}`);
      if (!published || published.expiresAt <= Date.now()) {
        try { await this.refresh(1, "dramabox"); }
        catch (e) { discoveryError = e instanceof MiniError ? e.message : "DramaBox indisponível."; }
      }
    }
    const all = preferPortugueseDramaBox((await this.store.titles()).map((t) => publicTitle(this.config, this.decorate(t))).filter((t): t is MiniTitle => !!t));
    let titles = q ? all.filter((t) => [t.title, ...t.alternativeTitles].some((n) => textKey(n).includes(q))) : all;
    let error: string | undefined = discoveryError;
    // No automatic paid search or per-card enrichment. Only a deliberate public search.
    if (q.length >= 3 && !titles.length && page === 1 && configured(this.config, "microdramalist") && this.config.enabled.microdramalist) {
      try {
        const found = await this.micro.search(q);
        const persisted = await this.ingest(found);
        titles = persisted.map((t) => publicTitle(this.config, t)).filter((t): t is MiniTitle => !!t);
      } catch (e) { error = e instanceof MiniError ? e.message : "Não foi possível pesquisar agora."; }
    }
    if (q.length >= 3 && !titles.length && page === 1 && configured(this.config, "syln")) {
      try { return await this.searchSylnDramaBox(q, page); }
      catch (e) { error = e instanceof MiniError ? e.message : "Não foi possível pesquisar DramaBox via Syln."; }
    }
    if (q.length >= 3 && !titles.length && page === 1 && dramaBoxEnabled) {
      try {
        const result = await this.searchDramaBox(q, page);
        if (result.titles.length) return result;
      } catch (e) { error = e instanceof MiniError ? e.message : "Não foi possível pesquisar no DramaBox."; }
    }
    return { titles: titles.slice((page - 1) * 24, page * 24), page, hasMore: titles.length > page * 24, error, dramaBoxCategoriesAvailable: dramaBoxEnabled, sylnDramaBoxAvailable: configured(this.config, "syln"),
      originalPlatforms: this.config.enabled.dramabox ? [{ name: "DramaBox", url: DRAMABOX_ORIGINAL_SITE }] : [] };
  }
  async getTitle(id: string) {
    const title = await this.store.title(id);
    if (!title || !publicTitle(this.config, title)) throw new MiniError("Minissérie não encontrada ou indisponível.", 404);
    return this.decorate(title);
  }
  async detail(id: string): Promise<TitleDetail> {
    let title = await this.getTitle(id);
    const ref = title.refs.find((r) => r.provider === "microdramalist");
    if (ref && configured(this.config, "microdramalist") && this.config.enabled.microdramalist) {
      // Exactly one known ID, on opening details; detail cache lasts seven days.
      try { title = (await this.ingest([await this.micro.detail(ref.id)]))[0]; }
      catch { /* Preserve permitted locally stored metadata during an upstream outage. */ }
    }
    const sylnRef = title.refs.find((r) => r.provider === "syln" && r.id.startsWith("dramabox:"));
    if (sylnRef && (!title.synopsis || !title.episodeCount) && configured(this.config, "syln")) {
      try { title = (await this.ingest([await this.syln.detail(sylnRef)]))[0]; }
      catch { /* Retain cached metadata; transport diagnostics record the failure. */ }
    } else if (!sylnRef && !title.synopsis && configured(this.config, "microdramalist")) {
      try { title = await this.enrich(id); }
      catch { /* Uncertain matches remain separate; existing details still work. */ }
    }
    const dramaBoxRef = title.refs.find((r) => r.provider === "dramabox");
    if (dramaBoxRef && (!title.synopsis || !title.episodeCount || !title.detailComplete) && configured(this.config, "dramabox")) {
      try { title = (await this.ingest([await this.dramaBox.getDramaDetail(dramaBoxRef.id)]))[0]; }
      catch { /* Keep permitted stored metadata available during an upstream outage. */ }
    }
    const visible = publicTitle(this.config, title);
    if (!visible) throw new MiniError("Minissérie indisponível nesta fonte.", 404);
    return { title: visible, sources: title.refs.map((r) => sourceStatus(this.config, r)) };
  }
  async resolve(id: string, key: string, purpose: "playback" | "episodes" = "playback") {
    const title = await this.getTitle(id);
    const ref = title.refs.find((r) => sourceKey(r) === key);
    if (!ref) throw new MiniError("Fonte não corresponde a esta minissérie.", 404);
    const status = sourceStatus(this.config, ref);
    if (!(purpose === "episodes" ? status.episodesAvailable : status.available)) throw new MiniError(status.reason || "Fonte indisponível.", 403);
    return ref;
  }
  async episodes(id: string, key: string) {
    const ref = await this.resolve(id, key, "episodes");
    if (ref.provider === "reelshort") return this.reelshort.episodes(ref);
    if (ref.provider === "syln") return this.syln.episodes(ref);
    if (ref.provider === "dramabox") return this.dramaBox.episodes(ref);
    throw new MiniError("Esta fonte não fornece episódios.", 403);
  }
  async play(id: string, key: string, episodeId: string, userId: number) {
    const ref = await this.resolve(id, key);
    const episodes = await this.episodes(id, key);
    if (!episodes.some((e) => e.id === episodeId && e.available)) throw new MiniError("Episódio não disponível nesta fonte.", 404);
    if (!await this.store.reserve(`userplay:${userId}`, 1, 20, 3600000)) throw new MiniError("Limite de solicitações de reprodução atingido.", 429);
    const requestKey = `${userId}:${sourceKey(ref)}:${episodeId}`;
    const pending = this.plays.get(requestKey);
    if (pending) return pending;
    const job = (async () => {
      const owner = crypto.randomUUID();
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(requestKey)))).map((n) => n.toString(16).padStart(2, "0")).join("");
      if (!await this.store.lease(`play:${hash}`, owner, ref.provider === "dramabox" ? 90000 : 25000)) throw new MiniError("Reprodução sendo preparada. Aguarde.");
      try {
        if (ref.provider === "reelshort") return await this.reelshort.play(ref, episodeId);
        if (ref.provider === "syln") return await this.syln.play(ref, episodeId);
        if (ref.provider === "dramabox") return await this.dramaBox.play(ref, episodeId);
        throw new MiniError("Fonte sem reprodução disponível.", 403);
      }
      finally { await this.store.release(`play:${hash}`, owner); }
    })().finally(() => this.plays.delete(requestKey));
    this.plays.set(requestKey, job);
    return job;
  }
  async readSylnSearch(query: string, page: number): Promise<Catalog | null> {
    const index = await this.store.get<{ ids: string[]; hasMore: boolean }>(`syln:dramabox:search:${await cacheId(query)}:${page}`);
    if (!index || index.expiresAt <= Date.now()) return null;
    const records = await Promise.all(index.value.ids.map((id) => this.store.title(id)));
    if (records.some((t) => !t)) return null;
    return { titles: preferPortugueseDramaBox(records.map((t) => publicTitle(this.config, this.decorate(t!))).filter((t): t is MiniTitle => !!t)), hasMore: index.value.hasMore, page, sylnDramaBoxAvailable: true };
  }
  async searchSylnDramaBox(query: string, page: number): Promise<Catalog> {
    this.allowed("syln");
    const result = await this.syln.searchPage(query, page, { platform: "dramabox", hasMedia: true });
    const titles = [...new Map((await this.ingest(result.titles)).map((t) => [t.id, t])).values()];
    await this.store.put(`syln:dramabox:search:${await cacheId(query)}:${page}`, { ids: titles.map((t) => t.id), hasMore: result.hasMore }, 86400000);
    return { titles: preferPortugueseDramaBox(titles.map((t) => publicTitle(this.config, t)).filter((t): t is MiniTitle => !!t)), page, hasMore: result.hasMore, sylnDramaBoxAvailable: true };
  }
  async catalogSylnDramaBox(query: string, page: number): Promise<Catalog> {
    if (query.length >= 3) {
      const indexed = await this.readSylnSearch(query, page);
      if (indexed) return indexed;
    }
    const all = preferPortugueseDramaBox((await this.store.titles()).filter((t) => t.refs.some((r) => r.provider === "syln" && r.id.startsWith("dramabox:"))).map((t) => publicTitle(this.config, this.decorate(t))).filter((t): t is MiniTitle => !!t));
    const titles = query ? all.filter((t) => [t.title, ...t.alternativeTitles].some((name) => textKey(name).includes(query))) : all;
    if (query.length >= 3 && !titles.length && configured(this.config, "syln")) return this.searchSylnDramaBox(query, page);
    return { titles: titles.slice((page - 1) * 24, page * 24), page, hasMore: titles.length > page * 24, sylnDramaBoxAvailable: configured(this.config, "syln") };
  }
  async setDistributionAuthorization(id: string, key: string, authorization: SourceRef["distributionAuthorization"]) {
    const owner = crypto.randomUUID();
    if (!await this.store.lease("catalog:write", owner, 30000)) throw new MiniError("Atualização de catálogo em andamento.");
    try {
      const title = await this.getTitle(id);
      const ref = title.refs.find((r) => sourceKey(r) === key);
      if (!ref || !(ref.provider === "reelshort" || (ref.provider === "syln" && ref.id.startsWith("dramabox:")))) throw new MiniError("Autorização não corresponde a uma fonte com controle de distribuição.", 400);
      if (authorization && (!authorization.reference?.trim() || authorization.reference.length > 500 || !Number.isFinite(Date.parse(authorization.verifiedAt)) || (authorization.expiresAt && !(Date.parse(authorization.expiresAt) > Date.now())))) throw new MiniError("Referência ou validade da autorização inválida.", 400);
      const next = { ...title, refs: title.refs.map((r) => sourceKey(r) === key ? { ...r, distributionAuthorization: authorization } : r) };
      await this.store.save(next);
      return { source: key, available: sourceStatus(this.config, next.refs.find((r) => sourceKey(r) === key)!).available };
    } finally { await this.store.release("catalog:write", owner); }
  }
  async searchDramaBox(query: string, page: number): Promise<Catalog> {
    this.allowed("dramabox");
    const result = await this.dramaBox.searchDrama(query, page);
    const titles = await this.publishDramaBox(result, `search:${query}:${page}`);
    await this.store.put(`dramabox:search-index:${await cacheId(query)}:${page}`, { ids: titles.map((t) => t.id), hasMore: result.hasMore }, 86400000);
    return { titles: titles.map((t) => publicTitle(this.config, t)).filter((t): t is MiniTitle => !!t), page, hasMore: result.hasMore, dramaBoxCategoriesAvailable: true };
  }
  async externalCatalog(provider: "reelshort", source: string, query: string, page: number): Promise<Catalog> {
    if (!Number.isSafeInteger(page) || page < 1 || page > 10) throw new MiniError("Página inválida.", 400);
    if (provider === "reelshort" && source !== "reelshort") throw new MiniError("Plataforma ReelShort inválida.", 400);
    const q = textKey(query);
    const searchKey = `external-search:v1:${provider}:${source}:${await cacheId(q)}`;
    if (q.length >= 3) {
      const index = await this.store.get<string[]>(searchKey);
      if (index && index.expiresAt > Date.now()) {
        const records = await Promise.all(index.value.map((id) => this.store.title(id)));
        if (records.every((t) => !!t)) {
          const titles = [...new Map(records.map((t) => [t!.id, t!])).values()].map((t) => publicTitle(this.config, this.decorate(t))).filter((t): t is MiniTitle => !!t);
          return { titles: titles.slice((page - 1) * 24, page * 24), page, hasMore: titles.length > page * 24 };
        }
      }
    }
    const local = (await this.store.titles()).filter((t) => t.refs.some((r) => r.provider === provider)).map((t) => publicTitle(this.config, this.decorate(t))).filter((t): t is MiniTitle => !!t).filter((t) => !q || [t.title, ...t.alternativeTitles].some((n) => textKey(n).includes(q)));
    if (local.length || !q || page !== 1) return { titles: local.slice((page - 1) * 24, page * 24), page, hasMore: local.length > page * 24 };
    this.allowed(provider);
    const result = await this.reelshort.list("newrelease", q);
    const persisted = await this.ingest(result.titles);
    await this.store.put(searchKey, [...new Set(persisted.map((t) => t.id))], 86400000);
    const titles = [...new Map(persisted.map((t) => [t.id, t])).values()].map((t) => publicTitle(this.config, t)).filter((t): t is MiniTitle => !!t);
    return { titles: titles.slice(0, 24), page: 1, hasMore: titles.length > 24 };
  }
  async refreshExternal(provider: "reelshort", source: string, feed: string, page: number) {
    this.allowed(provider);
    if (!Number.isSafeInteger(page) || page < 1 || page > 10) throw new MiniError("Página inválida.", 400);
    if (provider === "reelshort" && (source !== "reelshort" || page !== 1 || !["newrelease", "recommended", "dramadub"].includes(feed))) throw new MiniError("Lista ou página ReelShort inválida.", 400);
    const result = await this.reelshort.list(feed as ReelShortFeed);
    const titles = await this.ingest(result.titles);
    return { provider, platform: source, page, imported: new Set(titles.map((t) => t.id)).size, hasMore: result.hasMore };
  }
  async categories() { this.allowed("dramabox"); return this.dramaBox.getCategories(); }
  async episodeDetail(id: string, key: string, episodeId: string) {
    const ref = await this.resolve(id, key, "episodes");
    if (ref.provider !== "dramabox") throw new MiniError("Detalhe individual indisponível nesta fonte.", 404);
    return this.dramaBox.getEpisodeDetails(ref, episodeId);
  }
  async publishDramaBox(result: { titles: MiniTitle[] }, key: string) {
    this.allowed("dramabox");
    const publishedKey = `dramabox:published:${await cacheId(key)}`;
    const cached = await this.store.get<string[]>(publishedKey);
    if (cached && cached.expiresAt > Date.now()) {
      const titles = await Promise.all(cached.value.map((id) => this.store.title(id)));
      if (titles.every((t) => !!t)) return titles as MiniTitle[];
    }
    const titles = await this.ingest(result.titles);
    await this.store.put(publishedKey, titles.map((t) => t.id), 86400000);
    return titles;
  }
  async refresh(page: number, provider: "syln" | "dramabox" = "syln", feed: DramaBoxFeed = "catalog", category?: string, platform?: "dramabox") {
    if (provider === "dramabox") {
      this.allowed("dramabox");
      const result = await this.dramaBox.catalog(page, feed, category);
      const titles = await this.publishDramaBox(result, `${feed === "category" ? `category:${category}` : feed}:${page}`);
      await this.store.prune();
      return { provider, imported: titles.length, hasMore: result.hasMore, page, feed };
    }
    this.allowed("syln");
    const result = platform === "dramabox" ? await this.syln.dramaBoxCatalog(page) : await this.syln.catalog(page);
    const titles = [...new Map((await this.ingest(result.titles)).map((t) => [t.id, t])).values()];
    await this.store.prune();
    return { imported: titles.length, hasMore: result.hasMore, page, ...(platform === "dramabox" ? { provider: "syln", platform, origin: "DramaBox", preferredLanguage: "portuguese" in result ? result.portuguese : undefined, baseCount: "baseCount" in result ? result.baseCount : undefined, preferredCount: "preferredCount" in result ? result.preferredCount : undefined, warning: "warning" in result ? result.warning : undefined } : {}) };
  }
  async syncDramaBox() {
    if (!this.config.enabled.dramabox) throw new MiniError("Associação DramaBox desativada.", 403);
    const owner = crypto.randomUUID();
    if (!await this.store.lease("catalog:write", owner, 30000)) throw new MiniError("Atualização de catálogo em andamento.");
    try {
      const titles = await this.store.titles(); let updated = 0; let linked = 0;
      for (const title of titles) {
        const next = this.decorate(title);
        if (next.refs.some((r) => r.provider === "dramabox")) linked++;
        if (JSON.stringify(next.refs) !== JSON.stringify(title.refs)) { await this.store.save(next); updated++; }
      }
      return { provider: "dramabox", mode: "official-links", linked, updated, imported: 0, externalRequests: 0 };
    } finally { await this.store.release("catalog:write", owner); }
  }
  async enrich(id: string) {
    this.allowed("microdramalist");
    const title = await this.getTitle(id);
    const results = await this.micro.search(title.title);
    const candidates = results.filter((t) => textKey(t.title) === textKey(title.title) || title.alternativeTitles.some((s) => textKey(s) === textKey(t.title)));
    if (candidates.length !== 1) throw new MiniError("Nenhuma correspondência única para enriquecimento.", 409);
    const detailed = await this.micro.detail(candidates[0].refs[0].id);
    if (!sameProduction(title, detailed)) throw new MiniError("Correspondência sem identificadores ou evidências suficientes. Títulos não foram unidos.", 409);
    return (await this.ingest([detailed]))[0];
  }
  async attach(id: string, ref: SourceRef) {
    const owner = crypto.randomUUID();
    if (!await this.store.lease("catalog:write", owner, 30000)) throw new MiniError("Atualização em andamento.");
    try {
      const title = await this.getTitle(id);
      const conflict = (await this.store.titles()).find((t) => t.id !== title.id && t.refs.some((r) => sameReference(r, ref)));
      if (conflict) throw new MiniError("Referência já associada a outra produção.", 409);
      const next = { ...title, refs: [...title.refs.filter((r) => sourceKey(r) !== sourceKey(ref)), ref] };
      await this.store.save(next); return { attached: sourceKey(ref) };
    } finally { await this.store.release("catalog:write", owner); }
  }
  async diagnostics() {
    const providers = ["microdramalist", "syln", "dramabox", "reelshort"] as const;
    return Promise.all(providers.map(async (provider) => {
      const budget = providerBudget(provider);
      const usage = await this.store.budgetUsage(budget.key);
      return { provider, enabled: this.config.enabled[provider], configured: configured(this.config, provider), playbackEnabled: this.config.playback[provider], imagesEnabled: this.config.images[provider],
        ...(provider === "dramabox" ? { capabilities: DRAMABOX_CAPABILITIES, metadataFrom: ["microdramalist", "dramabox"], localIndexEnabled: this.config.enabled.dramabox } : {}),
        localBudget: { window: budget.key, used: (usage?.units || 0) / budget.unitScale, limit: budget.limit / budget.unitScale },
        lastRequest: (await this.store.get<Diagnostic>(`diagnostic:${provider}`))?.value || null, approximateRequestTotals: true,
        lastFailure: (await this.store.get(`last-failure:${provider === "microdramalist" ? "micro" : provider}`))?.value || null,
        cooldownUntil: (await this.store.get<number>(`cooldown:${provider}`))?.value || null };
    }));
  }
}
