import { MiniError, type Provider } from "./types.ts";
import type { MiniStore } from "./store.ts";

const MINUTE = 60000;
export function providerBudget(provider: Provider) {
  // Conservative local ceiling, not a claimed supplier quota.
  if (provider === "dramabox") return { key: `budget:dramabox:${Math.floor(Date.now() / MINUTE)}`, period: MINUTE, limit: 15, unitScale: 1 };
  if (provider === "reelshort") return { key: `budget:${provider}:${Math.floor(Date.now() / MINUTE)}`, period: MINUTE, limit: 10, unitScale: 1 };
  const period = provider === "microdramalist" ? MINUTE : 3600000;
  const limit = provider === "microdramalist" ? 15 : 5000;
  const window = Math.floor(Date.now() / period);
  return { key: `budget:${provider}:${window}`, period, limit, unitScale: provider === "syln" ? 100 : 1 };
}
export type Diagnostic = { at: string; status: number; requests: number; estimatedUnits: number; remaining: string | null; reset: string | null };
export class MiniTransport {
  store: MiniStore;
  fetcher: typeof fetch;
  pending = new Map<string, Promise<unknown>>();
  constructor(store: MiniStore, fetcher: typeof fetch = fetch) { this.store = store; this.fetcher = fetcher; }

  async cached<T>(key: string, ttl: number, load: () => Promise<T>, stale = 0, leaseMs = 30000): Promise<T> {
    const existing = this.pending.get(key);
    if (existing) return existing as Promise<T>;
    const job = (async () => {
      const old = await this.store.get<T>(key);
      if (old && old.expiresAt > Date.now()) return old.value;
      const failed = await this.store.get<{ message: string; status: number }>(`failure:${key}`);
      if (failed && failed.expiresAt > Date.now()) {
        if (old && old.staleUntil > Date.now()) return old.value;
        throw new MiniError(failed.value.message, failed.value.status);
      }
      const owner = crypto.randomUUID();
      if (!await this.store.lease(`request:${key}`, owner, leaseMs)) {
        if (old && old.staleUntil > Date.now()) return old.value;
        throw new MiniError("Consulta em andamento. Aguarde alguns segundos.", 503);
      }
      try {
        // Another process may have filled the cache between our read and lease.
        const fresh = await this.store.get<T>(key);
        if (fresh && fresh.expiresAt > Date.now()) return fresh.value;
        const value = await load();
        await this.store.put(key, value, ttl, stale);
        return value;
      } catch (error) {
        const e = error instanceof MiniError ? error : new MiniError("Fonte indisponível ou contrato de resposta inválido.", 502);
        await this.store.put(`failure:${key}`, { message: e.message, status: e.status }, MINUTE);
        await this.store.put(`last-failure:${key.split(":")[0]}`, { operation: key, message: e.message, status: e.status, at: new Date().toISOString() }, 7 * 86400000);
        if (old && old.staleUntil > Date.now()) return old.value;
        throw e;
      } finally { await this.store.release(`request:${key}`, owner); }
    })().finally(() => this.pending.delete(key));
    this.pending.set(key, job);
    return job;
  }

  async rawRequest(provider: Provider, url: string, headers: Record<string, string> = {}, play = false, options: { method?: string; body?: string; timeout?: number } = {}) {
    const cooldown = await this.store.get<number>(`cooldown:${provider}`);
    if (cooldown && cooldown.value > Date.now()) throw new MiniError("Fonte em pausa para preservar a cota. Tente mais tarde.", 429);
    const owner = crypto.randomUUID();
    let slot = "";
    // Global limit of two outbound requests, including across server processes.
    for (let i = 0; i < 2; i++) {
      const key = `slot:${provider}:${i}`;
      if (await this.store.lease(key, owner, 35000)) { slot = key; break; }
    }
    if (!slot) throw new MiniError("Fonte ocupada. Tente novamente em instantes.", 503);
    try {
      const units = provider === "syln" ? (play ? 100 : 5) : 1;
      // 15 per UTC minute means at most 30 across two adjacent minute windows.
      const budget = providerBudget(provider);
      if (!await this.store.reserve(budget.key, units, budget.limit, budget.period + MINUTE)) throw new MiniError("Orçamento local da fonte atingido. Tente mais tarde.", 429);
      let status = 0;
      let response: Response | undefined;
      try {
        response = await this.fetcher(url, { method: options.method || "GET", body: options.body, headers: { Accept: "application/json", ...headers }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(Math.min(options.timeout || 15000, 30000)) });
        status = response.status;
      } finally {
        // Never log credentials, response bodies, or signed media URLs.
        const prev = await this.store.get<Diagnostic>(`diagnostic:${provider}`);
        await this.store.put(`diagnostic:${provider}`, { at: new Date().toISOString(), status, requests: (prev?.value.requests || 0) + 1, estimatedUnits: (prev?.value.estimatedUnits || 0) + units / (provider === "syln" ? 100 : 1), remaining: response?.headers.get("RateLimit-Remaining") || response?.headers.get("X-RateLimit-Remaining") || null, reset: response?.headers.get("RateLimit-Reset") || response?.headers.get("X-RateLimit-Reset") || null }, 31 * 86400000);
      }
      if (!response) throw new MiniError("Falha ao acessar a fonte.", 502);
      const exhausted = (response.headers.get("RateLimit-Remaining") || response.headers.get("X-RateLimit-Remaining")) === "0";
      if (response.status === 429 || exhausted) {
        const retry = response.headers.get("Retry-After");
        const reset = Number(response.headers.get(provider === "microdramalist" ? "X-RateLimit-Reset" : "RateLimit-Reset"));
        const until = retry && /^\d+$/.test(retry) ? Date.now() + Number(retry) * 1000 : retry ? Date.parse(retry) : 0;
        const expires = Math.max(Date.now() + MINUTE, until || 0, reset > 0 ? (provider === "microdramalist" ? reset * 1000 : Date.now() + reset * 1000) : 0);
        await this.store.put(`cooldown:${provider}`, expires, expires - Date.now());
      }
      if (!response.ok) throw Object.assign(new MiniError(`Fonte respondeu HTTP ${response.status}.`, response.status === 429 ? 429 : response.status === 404 ? 404 : 502), { upstreamStatus: response.status });
      return { body: await response.text(), statusCode: response.status, headers: response.headers };
    } finally { await this.store.release(slot, owner); }
  }
  async request(provider: Provider, url: string, headers: Record<string, string> = {}, play = false) {
    const response = await this.rawRequest(provider, url, headers, play);
    if (!response.headers.get("content-type")?.includes("application/json")) throw new MiniError("Fonte retornou conteúdo incompatível.", 502);
    return JSON.parse(response.body) as unknown;
  }

}
