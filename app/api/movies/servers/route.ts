import { listarServidoresAdmin } from "../../../../db/player-servers";
import { testPlayerSource, type PlayerServerEndpointCheck } from "../../../../lib/player-server-health";
import {
  DEFAULT_DISABLED_PLAYER_SERVER_IDS,
  PLAYER_SERVERS,
  playerServerIdForSource,
  type PlayerServerDefinition,
} from "../../../../lib/player-servers";

export const dynamic = "force-dynamic";

type ServerState = PlayerServerDefinition & {
  enabled: boolean;
  last_status: "unknown" | "online" | "degraded" | "offline";
  last_latency_ms: number | null;
  last_diagnostic: {
    checks?: Array<{
      kind: "movie" | "tv";
      evidence?: { playbackConfirmed?: boolean };
      status?: "unknown" | "online" | "degraded" | "offline";
    }>;
  } | null;
};

type SourceCandidate = {
  id: string;
  serverId: string;
  url: string;
  server: ServerState;
};

type RankingResponse = {
  disabled: string[];
  order: string[];
  checks: Array<{
    id: string;
    serverId: string;
    status: "unknown" | "online" | "degraded" | "offline";
    latencyMs: number | null;
    message: string;
  }>;
  tested: number;
};

const MAX_CANDIDATES_TO_TEST = 6;
const CACHE_TTL_MS = 10 * 60_000;
const rankingCache = new Map<string, { expiresAt: number; value: RankingResponse }>();

function fallbackServers(): ServerState[] {
  return PLAYER_SERVERS.map((server) => ({
    ...server,
    enabled: !DEFAULT_DISABLED_PLAYER_SERVER_IDS.has(server.id),
    last_status: "unknown",
    last_latency_ms: null,
    last_diagnostic: null,
  }));
}

async function loadServers() {
  try {
    return await listarServidoresAdmin() as ServerState[];
  } catch {
    return fallbackServers();
  }
}

function manualCheck(server: ServerState, kind: "movie" | "tv") {
  return server.last_diagnostic?.checks?.find((check) => check.kind === kind) ?? null;
}

function experienceScore(server: ServerState) {
  const advertisingPoints = server.advertisingProfile === "none-declared"
    ? 7_000
    : server.advertisingProfile === "minimal-declared"
      ? 3_500
      : 0;
  const watchPartyPoints = server.watchPartySupport === "full" ? 1_200 : 0;
  return advertisingPoints + watchPartyPoints;
}

function storedScore(server: ServerState, kind: "movie" | "tv") {
  const statusPoints = {
    online: 4_000,
    degraded: 1_400,
    unknown: 1_000,
    offline: -5_000,
  }[server.last_status];
  const confirmed = manualCheck(server, kind);
  const manualPoints = confirmed?.evidence?.playbackConfirmed
    ? 6_000
    : confirmed?.status === "offline"
      ? -6_000
      : 0;
  const latencyPenalty = Math.min(1_500, Math.max(0, server.last_latency_ms ?? 0) / 8);
  return statusPoints
    + manualPoints
    + experienceScore(server)
    + (server.audioProfile === "pt-BR" ? 700 : 0)
    + (server.protectedEmbedCompatible ? 600 : -1_200)
    - (server.blockedReason ? 2_500 : 0)
    - server.priority * 10
    - latencyPenalty;
}

function endpointScore(candidate: SourceCandidate, check: PlayerServerEndpointCheck, kind: "movie" | "tv") {
  const statusPoints = check.status === "online" ? 15_000 : check.status === "degraded" ? 6_000 : -15_000;
  const confidencePoints = check.evidence.confidence === "high"
    ? 3_000
    : check.evidence.confidence === "medium"
      ? 1_200
      : check.evidence.confidence === "low"
        ? 300
        : 0;
  return statusPoints
    + confidencePoints
    + experienceScore(candidate.server)
    + (check.evidence.mediaProbe?.status === "passed" ? 2_500 : 0)
    + (check.evidence.playbackConfirmed ? 4_000 : 0)
    - (check.issues.some((item) => item.code === "PRIMARY_MEDIA_FAILED") ? 7_000 : 0)
    - Math.min(2_000, check.latencyMs / 5)
    + storedScore(candidate.server, kind) / 5;
}

function validCandidate(input: unknown, serversById: Map<string, ServerState>, kind: "movie" | "tv") {
  if (!input || typeof input !== "object") return null;
  const id = "id" in input && typeof input.id === "string" ? input.id : "";
  const rawUrl = "url" in input && typeof input.url === "string" ? input.url : "";
  if (!/^[a-z0-9-]{1,50}$/i.test(id) || rawUrl.length > 2_048) return null;
  const serverId = playerServerIdForSource(id);
  const server = serversById.get(serverId);
  if (!server?.enabled || (kind === "movie" ? !server.supportsMovie : !server.supportsTv)) return null;
  try {
    const url = new URL(rawUrl);
    const host = url.hostname.toLowerCase();
    const expected = server.domain.toLowerCase();
    if ((url.protocol !== "https:" && url.protocol !== "http:") || (host !== expected && !host.endsWith(`.${expected}`))) {
      return null;
    }
    return { id, serverId, url: url.href, server } satisfies SourceCandidate;
  } catch {
    return null;
  }
}

function cacheKey(kind: "movie" | "tv", candidates: SourceCandidate[]) {
  return `${kind}:${candidates.map((candidate) => `${candidate.id}=${candidate.url}`).join("|")}`;
}

export async function GET() {
  const servers = await loadServers();
  const disabled = servers.filter((server) => !server.enabled).map((server) => server.id);
  const ranking = servers
    .filter((server) => server.enabled)
    .sort((left, right) => storedScore(right, "movie") - storedScore(left, "movie"))
    .map((server) => server.id);
  return Response.json({ disabled, ranking }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  let body: { kind?: unknown; sources?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Payload inválido." }, { status: 400 });
  }
  const kind = body.kind === "tv" ? "tv" : body.kind === "movie" ? "movie" : null;
  if (!kind || !Array.isArray(body.sources)) {
    return Response.json({ error: "Tipo e fontes são obrigatórios." }, { status: 400 });
  }

  const servers = await loadServers();
  const serversById = new Map(servers.map((server) => [server.id, server]));
  const disabled = servers.filter((server) => !server.enabled).map((server) => server.id);
  const candidates = body.sources
    .slice(0, 50)
    .map((source) => validCandidate(source, serversById, kind))
    .filter((source): source is SourceCandidate => Boolean(source));
  const key = cacheKey(kind, candidates);
  const cached = rankingCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return Response.json(cached.value, { headers: { "Cache-Control": "private, max-age=60" } });
  }
  if (cached) rankingCache.delete(key);

  const initiallyRanked = [...candidates].sort(
    (left, right) => storedScore(right.server, kind) - storedScore(left.server, kind),
  );
  const targets = initiallyRanked.slice(0, MAX_CANDIDATES_TO_TEST);
  const tested = await Promise.all(targets.map(async (candidate) => ({
    candidate,
    check: await testPlayerSource(candidate.server, kind, candidate.url),
  })));
  const testedById = new Map(tested.map((result) => [result.candidate.id, result]));
  const order = [...candidates]
    .sort((left, right) => {
      const leftTest = testedById.get(left.id);
      const rightTest = testedById.get(right.id);
      const leftScore = leftTest ? endpointScore(left, leftTest.check, kind) : storedScore(left.server, kind) - 4_000;
      const rightScore = rightTest ? endpointScore(right, rightTest.check, kind) : storedScore(right.server, kind) - 4_000;
      return rightScore - leftScore;
    })
    .map((candidate) => candidate.id);
  const value = {
    disabled,
    order,
    checks: tested.map(({ candidate, check }) => ({
      id: candidate.id,
      serverId: candidate.serverId,
      status: check.status,
      latencyMs: check.latencyMs,
      message: check.message,
    })),
    tested: tested.length,
  } satisfies RankingResponse;
  rankingCache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, value });
  if (rankingCache.size > 100) {
    const oldest = rankingCache.keys().next().value;
    if (oldest) rankingCache.delete(oldest);
  }
  return Response.json(value, { headers: { "Cache-Control": "private, max-age=60" } });
}
