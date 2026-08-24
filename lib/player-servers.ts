export type PlayerServerStatus = "unknown" | "online" | "degraded" | "offline";
export type PlayerServerAdvertisingProfile = "none-declared" | "minimal-declared" | "unknown";
export type PlayerServerWatchPartySupport = "full" | "none";

export type PlayerServerDefinition = {
  id: string;
  name: string;
  domain: string;
  testUrl: string;
  testTvUrl: string;
  supportsMovie: boolean;
  supportsTv: boolean;
  priority: number;
  protectedEmbedCompatible: boolean;
  enabledByDefault: boolean;
  advertisingProfile: PlayerServerAdvertisingProfile;
  watchPartySupport: PlayerServerWatchPartySupport;
  prioritizesPortugueseAudio: boolean;
  compatibilityMessage?: string;
  blockedReason?: string;
};

type BasePlayerServer = Omit<PlayerServerDefinition, "priority" | "protectedEmbedCompatible" | "enabledByDefault" | "advertisingProfile" | "watchPartySupport" | "prioritizesPortugueseAudio"> & {
  protectedEmbedCompatible?: boolean;
  advertisingProfile?: PlayerServerAdvertisingProfile;
  watchPartySupport?: PlayerServerWatchPartySupport;
  prioritizesPortugueseAudio?: boolean;
};

const BASE_PLAYER_SERVERS: BasePlayerServer[] = [
  // Curadoria fechada em 20 provedores. Os brasileiros e os que aceitam
  // preferência de áudio em português ficam no topo; espelhos do mesmo
  // agregador não contam como provedores diferentes.
  { id: "betterflix", name: "BetterFlix", domain: "betterflix.cfd", testUrl: "https://betterflix.cfd/api/player?id=550&type=movie&direct=true", testTvUrl: "https://betterflix.cfd/api/player?id=1399&type=tv&season=1&episode=1&direct=true", supportsMovie: true, supportsTv: true, prioritizesPortugueseAudio: true },
  { id: "megaembed", name: "MegaEmbed", domain: "mgeb.top", testUrl: "https://mgeb.top/embed/550?player=vidstack", testTvUrl: "https://mgeb.top/embed/1399/1/1?player=vidstack", supportsMovie: true, supportsTv: true, prioritizesPortugueseAudio: true },
  { id: "pipocacine", name: "PipocaCine", domain: "pipocacine.lat", testUrl: "https://pipocacine.lat/embed/550", testTvUrl: "https://pipocacine.lat/embed/1399/1/1", supportsMovie: true, supportsTv: true, prioritizesPortugueseAudio: true },
  { id: "cdn-embed", name: "CDN Brasil", domain: "cdn-embed.com", testUrl: "https://cdn-embed.com/filme/550", testTvUrl: "https://cdn-embed.com/serie/1399/1/1", supportsMovie: true, supportsTv: true, prioritizesPortugueseAudio: true },
  { id: "myembed", name: "MyEmbed", domain: "myembed.biz", testUrl: "https://myembed.biz/filme/550", testTvUrl: "https://myembed.biz/serie/1399/1/1", supportsMovie: true, supportsTv: true, prioritizesPortugueseAudio: true },
  { id: "vidcore", name: "VidCore PT", domain: "vidcore.org", testUrl: "https://www.vidcore.org/embed/movie/550?lang=pt", testTvUrl: "https://www.vidcore.org/embed/tv/1399/1/1?lang=pt", supportsMovie: true, supportsTv: true, advertisingProfile: "none-declared", prioritizesPortugueseAudio: true },
  { id: "strigil", name: "Strigil", domain: "strigil.cc", testUrl: "https://strigil.cc/embed/movie/533535", testTvUrl: "", supportsMovie: true, supportsTv: false, advertisingProfile: "none-declared", watchPartySupport: "full", compatibilityMessage: "Sessão compartilhada disponível somente para filmes; a origem de séries não retornou mídia no teste real" },
  { id: "cinezo", name: "Cinezo", domain: "player.cinezo.live", testUrl: "https://player.cinezo.live/embed/movie/550", testTvUrl: "https://player.cinezo.live/embed/tv/1399/1/1", supportsMovie: true, supportsTv: true, advertisingProfile: "none-declared" },
  { id: "screenscape", name: "ScreenScape PT", domain: "screenscape.me", testUrl: "https://screenscape.me/embed?tmdb=550&type=movie&lan=por", testTvUrl: "https://screenscape.me/embed?tmdb=1399&type=tv&s=1&e=1&lan=por", supportsMovie: true, supportsTv: true, prioritizesPortugueseAudio: true },
  { id: "unlimplay", name: "UnlimPlay", domain: "unlimplay.com", testUrl: "https://unlimplay.com/f/embed/movie/550", testTvUrl: "https://unlimplay.com/f/embed/tv/1399/1/1", supportsMovie: true, supportsTv: true },
  { id: "vidsrc-wiki", name: "VidSrc Wiki", domain: "vidsrc.wiki", testUrl: "https://vidsrc.wiki/embed/movie/550", testTvUrl: "https://vidsrc.wiki/embed/tv/1399/1/1", supportsMovie: true, supportsTv: true, advertisingProfile: "none-declared" },
  { id: "cinesrc", name: "CineSrc", domain: "cinesrc.st", testUrl: "https://cinesrc.st/embed/movie/550", testTvUrl: "https://cinesrc.st/embed/tv/1399?s=1&e=1", supportsMovie: true, supportsTv: true, advertisingProfile: "minimal-declared" },
  { id: "videasy", name: "Videasy", domain: "player.videasy.net", testUrl: "https://player.videasy.net/movie/550", testTvUrl: "https://player.videasy.net/tv/1399/1/1", supportsMovie: true, supportsTv: true },
  { id: "moviesapi", name: "MoviesAPI", domain: "moviesapi.to", testUrl: "https://moviesapi.to/movie/550", testTvUrl: "https://moviesapi.to/tv/1399/1/1", supportsMovie: true, supportsTv: true },
  { id: "vidzen", name: "VidZen", domain: "vidzen.fun", testUrl: "https://vidzen.fun/movie/550", testTvUrl: "https://vidzen.fun/tv/1399/1/1", supportsMovie: true, supportsTv: true },
  { id: "autoembed-co", name: "AutoEmbed", domain: "autoembed.co", testUrl: "https://autoembed.co/movie/tmdb/550", testTvUrl: "https://autoembed.co/tv/tmdb/1399-1-1", supportsMovie: true, supportsTv: true },
  { id: "vidphantom", name: "VidPhantom", domain: "vidphantom.com", testUrl: "https://vidphantom.com/movie/550", testTvUrl: "https://vidphantom.com/tv/1399/1/1", supportsMovie: true, supportsTv: true },
  { id: "embed-api", name: "Embed API", domain: "player.embed-api.stream", testUrl: "https://player.embed-api.stream/?id=550&type=movie", testTvUrl: "https://player.embed-api.stream/?id=1399&s=1&e=1", supportsMovie: true, supportsTv: true },
  { id: "iembed", name: "iEmbed", domain: "iembed.codeera.dev", testUrl: "https://iembed.codeera.dev/embed/movie/550", testTvUrl: "https://iembed.codeera.dev/embed/tv/1399/1/1", supportsMovie: true, supportsTv: true },
  { id: "mapple", name: "Mapple", domain: "mapple.uk", testUrl: "https://mapple.uk/watch/movie/550", testTvUrl: "https://mapple.uk/watch/tv/1399-1-1", supportsMovie: true, supportsTv: true },
];

/** Problemas conhecidos exibidos como alerta; o administrador mantém o controle de uso. */
const BLOCKED_SERVER_REASONS: Record<string, string> = {
};

const SERVER_PRIORITY = [
  "betterflix", "megaembed", "pipocacine", "cdn-embed", "myembed",
  "vidcore", "strigil", "cinezo", "screenscape", "unlimplay",
  "vidsrc-wiki", "cinesrc", "videasy", "moviesapi", "vidzen",
  "autoembed-co", "vidphantom", "embed-api", "iembed", "mapple",
];

const PRIORITY_BY_ID = new Map(SERVER_PRIORITY.map((id, index) => [id, index]));

export const PLAYER_SERVERS: PlayerServerDefinition[] = BASE_PLAYER_SERVERS
  .map((server) => ({
    ...server,
    priority: PRIORITY_BY_ID.get(server.id) ?? 999,
    protectedEmbedCompatible: server.protectedEmbedCompatible !== false,
    enabledByDefault: true,
    advertisingProfile: server.advertisingProfile ?? "unknown",
    watchPartySupport: server.watchPartySupport ?? "none",
    prioritizesPortugueseAudio: server.prioritizesPortugueseAudio ?? false,
    blockedReason: BLOCKED_SERVER_REASONS[server.id],
  }))
  .sort((a, b) => a.priority - b.priority);

export const DEFAULT_DISABLED_PLAYER_SERVER_IDS = new Set<string>();

const SERVER_IDS = new Set(PLAYER_SERVERS.map((server) => server.id));

export function getPlayerServer(id: string) {
  return PLAYER_SERVERS.find((server) => server.id === id) ?? null;
}

export function playerServerIdForSource(sourceId: string) {
  if (sourceId === "cdn-tmdb" || sourceId === "cdn-imdb") return "cdn-embed";
  if (sourceId === "superflix-imdb") return "superflix-pro";
  if (sourceId === "warez-tmdb" || sourceId === "warez-imdb") return "warezcdn";
  return SERVER_IDS.has(sourceId) ? sourceId : sourceId;
}
