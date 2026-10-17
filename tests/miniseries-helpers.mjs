// TEST DOUBLE ONLY: production uses the MySQL store, never this in-memory implementation.
export class MemoryStore {
  cache = new Map(); locks = new Map(); usage = new Map(); catalog = new Map(); aliases = new Map();
  async get(key) { return structuredClone(this.cache.get(key) || null); }
  async put(key, value, ttl, stale = 0) { this.cache.set(key, { value: structuredClone(value), expiresAt: Date.now() + ttl, staleUntil: Date.now() + ttl + stale }); }
  async lease(key, owner, ms) {
    if ((this.locks.get(key)?.until || 0) > Date.now()) return false;
    this.locks.set(key, { owner, until: Date.now() + ms }); return true;
  }
  async release(key, owner) { if (this.locks.get(key)?.owner === owner) this.locks.delete(key); }
  async reserve(key, units, limit, ms) {
    const old = this.usage.get(key); const current = old && old.until > Date.now() ? old.units : 0;
    if (current + units > limit) return false;
    this.usage.set(key, { units: current + units, until: current ? old.until : Date.now() + ms }); return true;
  }
  async titles() { return structuredClone([...this.catalog.values()]); }
  async budgetUsage(key) { const row = this.usage.get(key); return row && row.until > Date.now() ? { units: row.units, expiresAt: row.until } : null; }
  async title(id) { return structuredClone(this.catalog.get(this.aliases.get(id) || id) || null); }
  async save(title, absorbed = []) {
    this.catalog.set(title.id, structuredClone(title));
    for (const id of absorbed) {
      for (const [alias, target] of this.aliases) if (target === id) this.aliases.set(alias, title.id);
      this.aliases.set(id, title.id); this.catalog.delete(id);
    }
  }
  async prune() {}
}
export function testConfig() {
  return {
    enabled: { microdramalist: true, syln: true, dramabox: false, reelshort: false },
    playback: { microdramalist: false, syln: true, dramabox: false, reelshort: false },
    images: { microdramalist: false, syln: true, dramabox: true, reelshort: false },
    dramaBoxMediaHosts: [], sylnToken: "MOCK-KEY",
  };
}
export const sylnFixture = { id: "dramabox:42", platform: "dramabox", content_type: "short_drama", title: "TEST FIXTURE ONLY", lang: "en", tags: ["Romance"], episode_count: 2, synopsis: "Mock synopsis", poster: "https://cdn.syln.dev/mock-poster.webp" };
export const microFixture = { id: "mdid-test42", title: "TEST FIXTURE ONLY", description: "Mock description", genres: ["Romance"], episodeCount: 2, releaseYear: null, languages: ["ENGLISH"], alternativeTitles: [], availableOn: [{ platform: "DramaBox", externalId: "42", url: "https://www.dramaboxdb.com/mock-title" }] };
