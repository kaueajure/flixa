import { miniStore } from "../../db/miniseries.ts";
import { config } from "./policy.ts";
import { MiniService } from "./service.ts";
import { MiniError } from "./types.ts";

// Transport uses persistent leases too; correctness does not depend on this instance.
const service = new MiniService(miniStore, config());
export function miniService() {
  service.config = config();
  service.syln.token = service.config.sylnToken;
  service.dramaBox.config = service.config;
  return service;
}
export function miniFailure(error: unknown) {
  const status = error instanceof MiniError ? error.status : 503;
  return Response.json({ error: error instanceof MiniError ? error.message : "Minisséries indisponíveis. Verifique o armazenamento e a configuração no painel de diagnóstico." }, { status, headers: { "Cache-Control": "no-store", ...(status === 429 || status === 503 ? { "Retry-After": "60" } : {}) } });
}
export function miniId(value: string | null) {
  if (!value || !/^mini_[a-z0-9-]{36}$/.test(value)) throw new MiniError("Identificador de minissérie inválido.", 400);
  return value;
}
export function sourceId(value: string | null) {
  if (!value || value.length > 190 || !/^[a-zA-Z0-9:_-]+$/.test(value)) throw new MiniError("Identificador de fonte inválido.", 400);
  return value;
}
