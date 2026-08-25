export type PlayerServerStatus = "unknown" | "online" | "degraded" | "offline";
export type PlayerServerAdvertisingProfile = "none-declared" | "minimal-declared" | "unknown";
export type PlayerServerWatchPartySupport = "full" | "none";

export type PlayerServerAudioTestUrl = {
  tmdbId: string;
  title: string;
  url: string;
};

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
  audioTestUrls: PlayerServerAudioTestUrl[];
  compatibilityMessage?: string;
  blockedReason?: string;
};

type BasePlayerServer = Omit<PlayerServerDefinition, "priority" | "protectedEmbedCompatible" | "enabledByDefault" | "advertisingProfile" | "watchPartySupport" | "prioritizesPortugueseAudio" | "audioTestUrls"> & {
  protectedEmbedCompatible?: boolean;
  advertisingProfile?: PlayerServerAdvertisingProfile;
  watchPartySupport?: PlayerServerWatchPartySupport;
  prioritizesPortugueseAudio?: boolean;
};

const BASE_PLAYER_SERVERS: BasePlayerServer[] = [
  // Inventário histórico restaurado de b9c5aa9. O painel mantém os
  // diagnósticos e alertas para que cada origem possa ser desativada isoladamente.
  { id: "moviesapi", name: "MoviesAPI", domain: "moviesapi.to", testUrl: "https://moviesapi.to/movie/550", testTvUrl: "https://moviesapi.to/tv/1399/1/1", supportsMovie: true, supportsTv: true },
  { id: "vidzen", name: "VidZen", domain: "vidzen.fun", testUrl: "https://vidzen.fun/movie/550", testTvUrl: "https://vidzen.fun/tv/1399/1/1", supportsMovie: true, supportsTv: true },
  { id: "autoembed-co", name: "AutoEmbed", domain: "autoembed.co", testUrl: "https://autoembed.co/movie/tmdb/550", testTvUrl: "https://autoembed.co/tv/tmdb/1399-1-1", supportsMovie: true, supportsTv: true },
  { id: "vidsrc-wiki", name: "VidSrc Wiki", domain: "vidsrc.wiki", testUrl: "https://vidsrc.wiki/embed/movie/550", testTvUrl: "https://vidsrc.wiki/embed/tv/1399/1/1", supportsMovie: true, supportsTv: true, advertisingProfile: "none-declared" },
  { id: "vidphantom", name: "VidPhantom", domain: "vidphantom.com", testUrl: "https://vidphantom.com/movie/550", testTvUrl: "https://vidphantom.com/tv/1399/1/1", supportsMovie: true, supportsTv: true },
  { id: "yapgrid", name: "YapGrid", domain: "yapgrid.com", testUrl: "https://yapgrid.com/embed/movie/550?lang=pt", testTvUrl: "https://yapgrid.com/embed/tv/1399/1/1?lang=pt", supportsMovie: true, supportsTv: true },
  { id: "videasy", name: "Videasy", domain: "player.videasy.net", testUrl: "https://player.videasy.net/movie/550", testTvUrl: "https://player.videasy.net/tv/1399/1/1", supportsMovie: true, supportsTv: true },
  { id: "vidcore", name: "VidCore", domain: "vidcore.org", testUrl: "https://www.vidcore.org/embed/movie/550", testTvUrl: "https://www.vidcore.org/embed/tv/1399/1/1", supportsMovie: true, supportsTv: true },
  { id: "cinesrc", name: "CineSrc", domain: "cinesrc.st", testUrl: "https://cinesrc.st/embed/movie/550", testTvUrl: "https://cinesrc.st/embed/tv/1399?s=1&e=1", supportsMovie: true, supportsTv: true, advertisingProfile: "minimal-declared" },
  { id: "embed-api", name: "Embed API", domain: "player.embed-api.stream", testUrl: "https://player.embed-api.stream/?id=550&type=movie", testTvUrl: "https://player.embed-api.stream/?id=1399&s=1&e=1", supportsMovie: true, supportsTv: true },
  { id: "iembed", name: "iEmbed", domain: "iembed.codeera.dev", testUrl: "https://iembed.codeera.dev/embed/movie/550", testTvUrl: "https://iembed.codeera.dev/embed/tv/1399/1/1", supportsMovie: true, supportsTv: true },
  { id: "mapple", name: "Mapple", domain: "mapple.uk", testUrl: "https://mapple.uk/watch/movie/550", testTvUrl: "https://mapple.uk/watch/tv/1399-1-1", supportsMovie: true, supportsTv: true },
  { id: "cdn-embed", name: "CDN Brasil", domain: "cdn-embed.com", testUrl: "https://cdn-embed.com/filme/550", testTvUrl: "", supportsMovie: true, supportsTv: false, prioritizesPortugueseAudio: true },
  { id: "myembed", name: "MyEmbed", domain: "myembed.biz", testUrl: "https://myembed.biz/filme/550", testTvUrl: "https://myembed.biz/serie/1399/1/1", supportsMovie: true, supportsTv: true, prioritizesPortugueseAudio: true },
  { id: "filmesyseries", name: "Filmes & Séries", domain: "filmesyseries.epizy.com", testUrl: "https://filmesyseries.epizy.com/embed-2/?type=movies&imdb=tt0137523", testTvUrl: "", supportsMovie: true, supportsTv: false, prioritizesPortugueseAudio: true },
  { id: "pipocacine", name: "PipocaCine", domain: "pipocacine.lat", testUrl: "https://pipocacine.lat/embed/550", testTvUrl: "https://pipocacine.lat/embed/1399/1/1", supportsMovie: true, supportsTv: true, prioritizesPortugueseAudio: true },
  { id: "pomfy", name: "Pomfy", domain: "api.pomfy.stream", testUrl: "https://api.pomfy.stream/filme/550", testTvUrl: "https://api.pomfy.stream/serie/1399/1/1", supportsMovie: true, supportsTv: true, prioritizesPortugueseAudio: true },
  { id: "betterflix", name: "BetterFlix", domain: "betterflix.lat", testUrl: "https://betterflix.lat/api/player?id=550&type=movie", testTvUrl: "https://betterflix.lat/api/player?id=1399&type=tv&season=1&episode=1", supportsMovie: true, supportsTv: true, prioritizesPortugueseAudio: true },
  { id: "vidbolt", name: "VidBolt", domain: "vidbolt.pro", testUrl: "https://vidbolt.pro/embed/movie/550", testTvUrl: "https://vidbolt.pro/embed/tv/1399/1/1", supportsMovie: true, supportsTv: true },
  { id: "embos", name: "Embos", domain: "embos.top", testUrl: "https://embos.top/movie/?mid=550", testTvUrl: "https://embos.top/tv/?mid=1399&s=1&e=1", supportsMovie: true, supportsTv: true },
  { id: "unlimplay", name: "UnlimPlay", domain: "unlimplay.com", testUrl: "https://unlimplay.com/f/embed/movie/550", testTvUrl: "https://unlimplay.com/f/embed/tv/1399/1/1", supportsMovie: true, supportsTv: true },
  { id: "screenscape", name: "ScreenScape", domain: "screenscape.me", testUrl: "https://screenscape.me/embed?tmdb=550&type=movie", testTvUrl: "https://screenscape.me/embed?tmdb=1399&type=tv&s=1&e=1", supportsMovie: true, supportsTv: true },
  { id: "nsrplay", name: "NasriPlay", domain: "nsrplay.space", testUrl: "https://nsrplay.space/embed/movie/550", testTvUrl: "https://nsrplay.space/embed/tv/1399/1/1", supportsMovie: true, supportsTv: true },
  { id: "filesun", name: "FileSuN", domain: "filesun.sbs", testUrl: "https://filesun.sbs/embed/movie/550", testTvUrl: "https://filesun.sbs/embed/tv/1399/1/1", supportsMovie: true, supportsTv: true },
  { id: "vidphantom-live", name: "VidPhantom Live", domain: "vidphantom.live", testUrl: "https://vidphantom.live/movie/550", testTvUrl: "https://vidphantom.live/tv/1399/1/1", supportsMovie: true, supportsTv: true },
  { id: "vidphantom-online", name: "VidPhantom Online", domain: "vidphantom.online", testUrl: "https://vidphantom.online/movie/550", testTvUrl: "https://vidphantom.online/tv/1399/1/1", supportsMovie: true, supportsTv: true },
  { id: "vidphantom-site", name: "VidPhantom Site", domain: "vidphantom.site", testUrl: "https://vidphantom.site/movie/550", testTvUrl: "https://vidphantom.site/tv/1399/1/1", supportsMovie: true, supportsTv: true },
  { id: "vidphantom-website", name: "VidPhantom Web", domain: "vidphantom.website", testUrl: "https://vidphantom.website/movie/550", testTvUrl: "https://vidphantom.website/tv/1399/1/1", supportsMovie: true, supportsTv: true },
  { id: "vidphantom-xyz", name: "VidPhantom XYZ", domain: "vidphantom.xyz", testUrl: "https://vidphantom.xyz/movie/550", testTvUrl: "https://vidphantom.xyz/tv/1399/1/1", supportsMovie: true, supportsTv: true },
  { id: "2embed-skin", name: "2Embed Skin", domain: "2embed.skin", testUrl: "https://www.2embed.skin/embed/550", testTvUrl: "https://www.2embed.skin/embedtv/1399&s=1&e=1", supportsMovie: true, supportsTv: true },
  { id: "2embed-cc", name: "2Embed CC", domain: "2embed.cc", testUrl: "https://www.2embed.cc/embed/550", testTvUrl: "https://www.2embed.cc/embedtv/1399&s=1&e=1", supportsMovie: true, supportsTv: true },
  { id: "nontongo", name: "Nontongo", domain: "nontongo.win", testUrl: "https://www.nontongo.win/embed/movie/550", testTvUrl: "https://www.nontongo.win/embed/tv/1399/1/1", supportsMovie: true, supportsTv: true },
  { id: "primesrc", name: "PrimeSrc", domain: "primesrc.me", testUrl: "https://primesrc.me/embed/movie?tmdb=550", testTvUrl: "https://primesrc.me/embed/tv?tmdb=1399&season=1&episode=1", supportsMovie: true, supportsTv: true },
  { id: "vidlux", name: "VidLux", domain: "vidlux.site", testUrl: "https://vidlux.site/embed/movie/550", testTvUrl: "https://vidlux.site/embed/tv/1399/1/1", supportsMovie: true, supportsTv: true },
  { id: "cinezo", name: "Cinezo", domain: "player.cinezo.live", testUrl: "https://player.cinezo.live/embed/movie/550", testTvUrl: "https://player.cinezo.live/embed/tv/1399/1/1", supportsMovie: true, supportsTv: true },
  { id: "vidlux-top", name: "VidLux Top", domain: "vidlux.top", testUrl: "https://vidlux.top/embed/movie/550", testTvUrl: "https://vidlux.top/embed/tv/1399/1/1", supportsMovie: true, supportsTv: true },
  { id: "vidlux-quilox", name: "VidLux Quilox", domain: "vidlux.site", testUrl: "https://vidlux.site/embed/movie/550?server=quilox", testTvUrl: "https://vidlux.site/embed/tv/1399/1/1?server=quilox", supportsMovie: true, supportsTv: true },
  { id: "vidlux-spider", name: "VidLux Spider", domain: "vidlux.site", testUrl: "https://vidlux.site/embed/movie/550?server=spider", testTvUrl: "https://vidlux.site/embed/tv/1399/1/1?server=spider", supportsMovie: true, supportsTv: true },
  { id: "vidlux-magic", name: "VidLux Magic", domain: "vidlux.site", testUrl: "https://vidlux.site/embed/movie/550?server=magic", testTvUrl: "https://vidlux.site/embed/tv/1399/1/1?server=magic", supportsMovie: true, supportsTv: true },
  { id: "vidlux-dubai", name: "VidLux Dubai", domain: "vidlux.site", testUrl: "https://vidlux.site/embed/movie/550?server=dubai", testTvUrl: "https://vidlux.site/embed/tv/1399/1/1?server=dubai", supportsMovie: true, supportsTv: true },
  { id: "vidlux-astra", name: "VidLux Astra", domain: "vidlux.site", testUrl: "https://vidlux.site/embed/movie/550?server=astra", testTvUrl: "https://vidlux.site/embed/tv/1399/1/1?server=astra", supportsMovie: true, supportsTv: true },
  { id: "vidlux-vidrock", name: "VidLux VidRock", domain: "vidlux.site", testUrl: "https://vidlux.site/embed/movie/550?server=vidrock", testTvUrl: "https://vidlux.site/embed/tv/1399/1/1?server=vidrock", supportsMovie: true, supportsTv: true },
  { id: "primesrc-primevid", name: "PrimeSrc PrimeVid", domain: "primesrc.me", testUrl: "https://primesrc.me/embed/movie?tmdb=550&whitelistServers=PrimeVid", testTvUrl: "https://primesrc.me/embed/tv?tmdb=1399&season=1&episode=1&whitelistServers=PrimeVid", supportsMovie: true, supportsTv: true },
  { id: "primesrc-voe", name: "PrimeSrc Voe", domain: "primesrc.me", testUrl: "https://primesrc.me/embed/movie?tmdb=550&whitelistServers=Voe", testTvUrl: "https://primesrc.me/embed/tv?tmdb=1399&season=1&episode=1&whitelistServers=Voe", supportsMovie: true, supportsTv: true },
  { id: "primesrc-dood", name: "PrimeSrc Dood", domain: "primesrc.me", testUrl: "https://primesrc.me/embed/movie?tmdb=550&whitelistServers=Dood", testTvUrl: "https://primesrc.me/embed/tv?tmdb=1399&season=1&episode=1&whitelistServers=Dood", supportsMovie: true, supportsTv: true },
];

/** Problemas conhecidos exibidos como alerta; o administrador mantém o controle de uso. */
const BLOCKED_SERVER_REASONS: Record<string, string> = {
  filmesyseries: "A URL configurada não retorna um player",
  pomfy: "O endpoint de reprodução retorna HTTP 403",
  betterflix: "A URL redireciona para uma página comum em vez de um embed",
};

const SERVER_PRIORITY = [
  "pipocacine", "myembed", "cdn-embed",
  "pomfy", "betterflix", "filmesyseries",
  "vidsrc-wiki", "cinesrc", "moviesapi", "vidzen", "videasy", "yapgrid",
  "vidbolt", "embos", "unlimplay", "screenscape", "nsrplay", "filesun",
  "vidphantom-live", "vidphantom-online", "vidphantom-site", "vidphantom-website",
  "vidphantom-xyz", "2embed-skin", "2embed-cc", "nontongo", "primesrc", "vidlux", "cinezo",
  "vidlux-top", "vidlux-quilox", "vidlux-spider", "vidlux-magic",
  "vidlux-dubai", "vidlux-astra", "vidlux-vidrock", "primesrc-primevid", "primesrc-voe", "primesrc-dood",
  "autoembed-co", "vidphantom", "vidcore", "embed-api", "iembed", "mapple",
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
    audioTestUrls: [
      { tmdbId: "105", title: "De Volta para o Futuro", url: server.testUrl.replace(/550/g, "105") },
      { tmdbId: "808", title: "Shrek", url: server.testUrl.replace(/550/g, "808") },
      { tmdbId: "299534", title: "Vingadores: Ultimato", url: server.testUrl.replace(/550/g, "299534") },
    ],
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
  return SERVER_IDS.has(sourceId) ? sourceId : sourceId;
}
