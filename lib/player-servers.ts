export type PlayerServerStatus = "unknown" | "online" | "offline";

export type PlayerServerDefinition = {
  id: string;
  name: string;
  domain: string;
  testUrl: string;
  testTvUrl: string;
  supportsMovie: boolean;
  supportsTv: boolean;
  audioProfile: "pt-BR" | "legendado";
  priority: number;
  protectedEmbedCompatible: boolean;
  compatibilityMessage?: string;
};

type BasePlayerServer = Omit<PlayerServerDefinition, "audioProfile" | "priority" | "protectedEmbedCompatible"> & {
  protectedEmbedCompatible?: boolean;
};

const UNSAFE_EMBED_MESSAGE = "Exige iframe sem sandbox; ficaria livre para abrir anúncios e novas abas";

const BASE_PLAYER_SERVERS: BasePlayerServer[] = [
  { id: "vidlink", name: "VidLink", domain: "vidlink.pro", testUrl: "https://vidlink.pro/movie/550", testTvUrl: "https://vidlink.pro/tv/1399/1/1", supportsMovie: true, supportsTv: true, protectedEmbedCompatible: false, compatibilityMessage: UNSAFE_EMBED_MESSAGE },
  { id: "moviesapi", name: "MoviesAPI", domain: "moviesapi.to", testUrl: "https://moviesapi.to/movie/550", testTvUrl: "https://moviesapi.to/tv/1399/1/1", supportsMovie: true, supportsTv: true },
  { id: "vidfast", name: "VidFast", domain: "vidfast.vc", testUrl: "https://vidfast.vc/movie/550?autoPlay=false&sub=pt", testTvUrl: "https://vidfast.vc/tv/1399/1/1?autoPlay=false&sub=pt", supportsMovie: true, supportsTv: true, protectedEmbedCompatible: false, compatibilityMessage: UNSAFE_EMBED_MESSAGE },
  { id: "autoembed-co", name: "AutoEmbed", domain: "autoembed.co", testUrl: "https://autoembed.co/movie/tmdb/550", testTvUrl: "https://autoembed.co/tv/tmdb/1399-1-1", supportsMovie: true, supportsTv: true },
  { id: "vidsrc-link", name: "VidSrc Link", domain: "vidsrc.link", testUrl: "https://vidsrc.link/embed/movie/550", testTvUrl: "https://vidsrc.link/embed/tv/1399/1/1", supportsMovie: true, supportsTv: true },
  { id: "vidsrc-wiki", name: "VidSrc Wiki", domain: "vidsrc.wiki", testUrl: "https://vidsrc.wiki/embed/movie/550", testTvUrl: "https://vidsrc.wiki/embed/tv/1399/1/1", supportsMovie: true, supportsTv: true },
  { id: "vidsrcme", name: "VidSrcMe", domain: "vidsrcme.su", testUrl: "https://vidsrcme.su/embed/movie/550", testTvUrl: "https://vidsrcme.su/embed/tv/1399/1-1", supportsMovie: true, supportsTv: true },
  { id: "vidphantom", name: "VidPhantom", domain: "vidphantom.com", testUrl: "https://vidphantom.com/movie/550", testTvUrl: "https://vidphantom.com/tv/1399/1/1", supportsMovie: true, supportsTv: true },
  { id: "yapgrid", name: "YapGrid", domain: "yapgrid.com", testUrl: "https://yapgrid.com/embed/movie/550?lang=pt", testTvUrl: "https://yapgrid.com/embed/tv/1399/1/1?lang=pt", supportsMovie: true, supportsTv: true },
  { id: "videasy", name: "Videasy", domain: "player.videasy.net", testUrl: "https://player.videasy.net/movie/550", testTvUrl: "https://player.videasy.net/tv/1399/1/1", supportsMovie: true, supportsTv: true },

  { id: "ezvidapi", name: "EZVidAPI", domain: "ezvidapi.com", testUrl: "https://ezvidapi.com/embed/movie/550", testTvUrl: "https://ezvidapi.com/embed/tv/1399/1/1", supportsMovie: true, supportsTv: true },
  { id: "vidcore", name: "VidCore", domain: "vidcore.org", testUrl: "https://www.vidcore.org/embed/movie/550", testTvUrl: "https://www.vidcore.org/embed/tv/1399/1/1", supportsMovie: true, supportsTv: true },
  { id: "cinesrc", name: "CineSrc", domain: "cinesrc.st", testUrl: "https://cinesrc.st/embed/movie/550", testTvUrl: "https://cinesrc.st/embed/tv/1399?s=1&e=1", supportsMovie: true, supportsTv: true },
  { id: "vidsrc-mov", name: "VidSrc MOV", domain: "vidsrc.mov", testUrl: "https://vidsrc.mov/embed/movie/550", testTvUrl: "https://vidsrc.mov/embed/tv/1399/1/1", supportsMovie: true, supportsTv: true },
  { id: "cinextream", name: "CineXtream", domain: "cinextream.net", testUrl: "https://cinextream.net/api/embed/movie/550", testTvUrl: "https://cinextream.net/api/embed/tv/1399/1/1", supportsMovie: true, supportsTv: true },
  { id: "embed-api", name: "Embed API", domain: "player.embed-api.stream", testUrl: "https://player.embed-api.stream/?id=550&type=movie", testTvUrl: "https://player.embed-api.stream/?id=1399&s=1&e=1", supportsMovie: true, supportsTv: true },
  { id: "vidapi", name: "VidAPI", domain: "vaplayer.ru", testUrl: "https://vaplayer.ru/embed/movie/550", testTvUrl: "https://vaplayer.ru/embed/tv/1399/1/1", supportsMovie: true, supportsTv: true, protectedEmbedCompatible: false, compatibilityMessage: UNSAFE_EMBED_MESSAGE },
  { id: "1embed", name: "1Embed", domain: "1embed.cc", testUrl: "https://1embed.cc/embed/movie/550", testTvUrl: "https://1embed.cc/embed/tv/1399/1/1", supportsMovie: true, supportsTv: true, protectedEmbedCompatible: false, compatibilityMessage: UNSAFE_EMBED_MESSAGE },
  { id: "iembed", name: "iEmbed", domain: "iembed.codeera.dev", testUrl: "https://iembed.codeera.dev/embed/movie/550", testTvUrl: "https://iembed.codeera.dev/embed/tv/1399/1/1", supportsMovie: true, supportsTv: true },
  { id: "mapple", name: "Mapple", domain: "mapple.uk", testUrl: "https://mapple.uk/watch/movie/550", testTvUrl: "https://mapple.uk/watch/tv/1399-1-1", supportsMovie: true, supportsTv: true },

  { id: "cdn-embed", name: "CDN Brasil", domain: "cdn-embed.com", testUrl: "https://cdn-embed.com/filme/550", testTvUrl: "", supportsMovie: true, supportsTv: false },
  { id: "superflix-pro", name: "SuperFlix", domain: "superflixapi.pro", testUrl: "https://superflixapi.pro/filme/550", testTvUrl: "https://superflixapi.pro/serie/1399/1/1", supportsMovie: true, supportsTv: true },
  { id: "superflix-help", name: "SuperFlix Alt", domain: "superflixapi.help", testUrl: "https://superflixapi.help/filme/550", testTvUrl: "https://superflixapi.help/serie/1399/1/1", supportsMovie: true, supportsTv: true },
  { id: "warezcdn", name: "WarezCDN", domain: "warezcdn.lat", testUrl: "https://warezcdn.lat/filme/550", testTvUrl: "", supportsMovie: true, supportsTv: false },
  { id: "111movies", name: "111Movies", domain: "111movies.net", testUrl: "https://111movies.net/movie/550", testTvUrl: "", supportsMovie: true, supportsTv: false, protectedEmbedCompatible: false, compatibilityMessage: UNSAFE_EMBED_MESSAGE },
  { id: "2embed", name: "2Embed", domain: "2embed.online", testUrl: "https://www.2embed.online/embed/movie/550", testTvUrl: "", supportsMovie: true, supportsTv: false },
  { id: "myembed", name: "MyEmbed", domain: "myembed.biz", testUrl: "https://myembed.biz/filme/550", testTvUrl: "https://myembed.biz/serie/1399/1/1", supportsMovie: true, supportsTv: true },
  { id: "filmesyseries", name: "Filmes & Séries", domain: "filmesyseries.epizy.com", testUrl: "https://filmesyseries.epizy.com/embed-2/?type=movies&imdb=tt0137523", testTvUrl: "", supportsMovie: true, supportsTv: false },

  { id: "megaembed-br", name: "MegaEmbed BR", domain: "mgeb.top", testUrl: "https://mgeb.top/embed/550", testTvUrl: "https://mgeb.top/embed/1399/1/1", supportsMovie: true, supportsTv: true, protectedEmbedCompatible: false, compatibilityMessage: UNSAFE_EMBED_MESSAGE },
  { id: "pipocacine", name: "PipocaCine", domain: "pipocacine.lat", testUrl: "https://pipocacine.lat/embed/550", testTvUrl: "https://pipocacine.lat/embed/1399/1/1", supportsMovie: true, supportsTv: true },
  { id: "redeflix", name: "RedeFlix", domain: "redeflixapi.store", testUrl: "https://redeflixapi.store/filme/550", testTvUrl: "https://redeflixapi.store/serie/1399/1/1", supportsMovie: true, supportsTv: true, protectedEmbedCompatible: false, compatibilityMessage: UNSAFE_EMBED_MESSAGE },
  { id: "pomfy", name: "Pomfy", domain: "api.pomfy.stream", testUrl: "https://api.pomfy.stream/filme/550", testTvUrl: "https://api.pomfy.stream/serie/1399/1/1", supportsMovie: true, supportsTv: true },
  { id: "betterflix", name: "BetterFlix", domain: "betterflix.lat", testUrl: "https://betterflix.lat/api/player?id=550&type=movie", testTvUrl: "https://betterflix.lat/api/player?id=1399&type=tv&season=1&episode=1", supportsMovie: true, supportsTv: true },
  { id: "megaembedapi", name: "MegaEmbedAPI", domain: "megaembedapi.site", testUrl: "https://megaembedapi.site/embed/tt0137523", testTvUrl: "https://megaembedapi.site/embed/series?imdb=tt0944947&sea=1&epi=1", supportsMovie: true, supportsTv: true },
  { id: "vidsrc-fyi", name: "VidSrc FYI", domain: "vidsrc.fyi", testUrl: "https://vidsrc.fyi/embed/movie/550", testTvUrl: "https://vidsrc.fyi/embed/tv/1399/1/1", supportsMovie: true, supportsTv: true },
];

const SUBTITLED_SERVER_IDS = new Set(["vidfast", "vidsrc-wiki", "yapgrid", "videasy", "vidsrc-fyi"]);

const SERVER_PRIORITY = [
  "megaembed-br", "cdn-embed", "superflix-pro", "superflix-help", "warezcdn",
  "pomfy", "betterflix", "pipocacine", "redeflix", "megaembedapi",
  "myembed", "filmesyseries", "vidlink", "moviesapi", "autoembed-co",
  "vidsrc-link", "vidsrcme", "vidphantom", "ezvidapi", "vidcore",
  "cinesrc", "vidsrc-mov", "cinextream", "embed-api", "vidapi",
  "1embed", "iembed", "mapple", "111movies", "2embed",
  "vidsrc-fyi", "vidfast", "vidsrc-wiki", "yapgrid", "videasy",
];

const PRIORITY_BY_ID = new Map(SERVER_PRIORITY.map((id, index) => [id, index]));

export const PLAYER_SERVERS: PlayerServerDefinition[] = BASE_PLAYER_SERVERS
  .map((server) => ({
    ...server,
    audioProfile: SUBTITLED_SERVER_IDS.has(server.id) ? "legendado" as const : "pt-BR" as const,
    priority: PRIORITY_BY_ID.get(server.id) ?? 999,
    protectedEmbedCompatible: server.protectedEmbedCompatible !== false,
  }))
  .sort((a, b) => a.priority - b.priority);

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
