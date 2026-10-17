import { AsyncLocalStorage } from "node:async_hooks";
import { MiniError } from "../types.ts";
import { record } from "../normalize.ts";
import type { MiniTransport } from "../transport.ts";

export type DramaBoxMethod = "getDramaList" | "getLatest" | "getRecommendedBooks" | "getTrending" | "getCategories" | "getBooksByCategory" | "searchDrama" | "getDramaDetail" | "getChapters" | "getEpisodeDetails" | "getStreamUrl";
export type SdkCall = (method: DramaBoxMethod, args: (string | number)[], language: "pt" | "en", play?: boolean) => Promise<unknown>;
type Context = { transport: MiniTransport; play: boolean; deadline: number; error?: MiniError; calls: number; lastRequest: number; chapters: Map<string, unknown> };
const context = new AsyncLocalStorage<Context>();
let clients: Promise<Record<"pt" | "en", import("@zhadev/dramabox").default>> | undefined;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function nodeOnly() {
  if (typeof window !== "undefined" || typeof process === "undefined" || !process.versions?.node || "WebSocketPair" in globalThis) throw new MiniError("DramaBox requer o backend Node.js; indisponível neste runtime.", 503);
}
async function sdkClients() {
  nodeOnly();
  return clients ||= (async () => {
    const { default: DramaboxClient, config } = await import("@zhadev/dramabox");
    if (config.flixaTransportVersion !== 1) throw new MiniError("Patch de transporte DramaBox ausente. Execute npm install.", 503);
    // The SDK's instance options do not control its global nested retries.
    config.maxRetries = 0;
    config.timeout = 30000;
    config.requestDelay = 1000;
    config.flixaHttpRequest = async (address: string, options: { method?: string; headers?: Record<string, string>; body?: string }) => {
      const ctx = context.getStore();
      if (!ctx) throw new MiniError("Operação DramaBox fora do backend autorizado.", 403);
      if (ctx.error) throw ctx.error;
      const url = new URL(address);
      if (url.protocol !== "https:" || url.port || !["sapi.dramaboxdb.com", "www.webfic.com"].includes(url.hostname)) throw new MiniError("Destino DramaBox não permitido.", 502);
      const denied = await ctx.transport.store.get<number>(`dramabox:access-denied:${url.hostname}`);
      if (denied && denied.expiresAt > Date.now()) {
        ctx.error = Object.assign(new MiniError(`DramaBox em pausa após HTTP ${denied.value} neste host.`, 502), { upstreamStatus: denied.value });
        throw ctx.error;
      }
      const headers = Object.fromEntries(Object.entries(options.headers || {}).filter(([key]) => !/^(host|content-length|accept-encoding|x-forwarded-for|x-real-ip|forwarded)$/i.test(key)));
      for (let attempt = 0; attempt <= 2; attempt++) {
        if (Date.now() >= ctx.deadline || ++ctx.calls > 6) throw new MiniError("Limite de duração ou chamadas da operação DramaBox atingido.", 503);
        const previous = await ctx.transport.store.get<number>("dramabox:last-request");
        await wait(Math.max(0, 1000 - (Date.now() - Math.max(ctx.lastRequest, previous?.value || 0))));
        ctx.lastRequest = Date.now();
        await ctx.transport.store.put("dramabox:last-request", ctx.lastRequest, 300000);
        try {
          const result = await ctx.transport.rawRequest("dramabox", address, headers, ctx.play, { method: options.method, body: options.body, timeout: Math.min(30000, Math.max(1, ctx.deadline - Date.now())) });
          // Authentication/application restrictions must not trigger token-refresh loops.
          try {
            const json = JSON.parse(result.body);
            if (json?.success === false) {
              const code = Number(json.code);
              throw Object.assign(new MiniError(`DramaBox recusou a operação${Number.isFinite(code) ? ` (código ${code})` : ""}.`, code === 429 ? 429 : 502), { upstreamStatus: Number.isFinite(code) ? code : undefined });
            }
            if (url.pathname === "/webfic/home/browse" && (!Array.isArray(json?.data?.types) || !Array.isArray(json?.data?.bookList))) throw new MiniError("DramaBox: contrato público browse mudou.", 502);
          } catch (error) { if (error instanceof MiniError) throw error; }
          return result;
        } catch (error) {
          const e = error instanceof MiniError ? error : new MiniError("Falha de rede no SDK DramaBox.", 502);
          const status = (e as MiniError & { upstreamStatus?: number }).upstreamStatus;
          if (status === 401 || status === 403) await ctx.transport.store.put(`dramabox:access-denied:${url.hostname}`, status, 300000);
          if (e.status === 429) {
            const cooldown = await ctx.transport.store.get<number>("cooldown:dramabox");
            if (!cooldown || cooldown.value <= Date.now()) await ctx.transport.store.put("cooldown:dramabox", Date.now() + 60000, 60000);
          }
          if (e.status === 429 || (e.message.includes("contrato público") || e.message.includes("recusou")) || (status && status < 500) || attempt === 2 || Date.now() + 2000 >= ctx.deadline) { ctx.error = e; throw e; }
          await wait(1000 * (attempt + 1));
        }
      }
      throw new MiniError("DramaBox indisponível.", 502);
    };
    const result = {} as Record<"pt" | "en", import("@zhadev/dramabox").default>;
    for (const language of ["pt", "en"] as const) {
      const client = new DramaboxClient({ language, timeout: 30000, maxRetries: 2, cacheTTL: 300, requestDelay: 1000 });
      // Central MySQL cache stores projections only, never SDK payloads/media URLs.
      client.cache.close(); client.getCached = () => undefined; client.setCached = () => undefined;
      const chapters = client.getChapters.bind(client);
      client.getChapters = async (id) => {
        const ctx = context.getStore();
        if (!ctx) throw new MiniError("Operação sem contexto Node.", 403);
        if (ctx.chapters.has(id)) return ctx.chapters.get(id);
        const value = await chapters(id); ctx.chapters.set(id, value); return value;
      };
      const stream = client.getStreamUrl.bind(client);
      client.getStreamUrl = async (id, index) => {
        const ctx = context.getStore();
        // getEpisodeDetails invokes getStreamUrl internally. Do not fetch media here.
        if (!ctx?.play) return { success: false, data: null, message: "Vídeo solicitado somente ao iniciar reprodução autorizada." };
        const response = record(await client.getChapters(id));
        const data = record(response.data);
        const chapter = Array.isArray(data.chapters) ? data.chapters.map(record).find((c) => c.chapterIndex === index) : undefined;
        if (!chapter || chapter.isLocked !== false || chapter.isCharge !== false) throw new MiniError("Episódio protegido ou sem disponibilidade confirmada.", 403);
        return stream(id, index);
      };
      result[language] = client;
    }
    return result;
  })();
}

export function dramaBoxSdk(transport: MiniTransport): SdkCall {
  return async (method, args, language, play = false) => {
    nodeOnly();
    const owner = crypto.randomUUID();
    if (!await transport.store.lease("dramabox:sdk-operation", owner, 90000)) throw new MiniError("DramaBox ocupado. Aguarde a consulta atual.", 503);
    const ctx: Context = { transport, play, deadline: Date.now() + 60000, calls: 0, lastRequest: 0, chapters: new Map() };
    try {
      const client = (await sdkClients())[language];
      const value = await context.run(ctx, () => Reflect.apply(client[method], client, args) as Promise<unknown>);
      if (ctx.error) throw ctx.error;
      if (record(value).success !== true) throw new MiniError(`DramaBox: ${method} retornou success=false.`, 502);
      return value;
    } finally { await transport.store.release("dramabox:sdk-operation", owner); }
  };
}
