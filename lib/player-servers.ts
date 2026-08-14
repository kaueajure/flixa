export type PlayerServerStatus = "unknown" | "online" | "offline";

export type PlayerServerDefinition = {
  id: string;
  name: string;
  domain: string;
  testUrl: string;
  testTvUrl: string;
  supportsMovie: boolean;
  supportsTv: boolean;
};

export const PLAYER_SERVERS: PlayerServerDefinition[] = [
  { id: "vidlink", name: "VidLink", domain: "vidlink.pro", testUrl: "https://vidlink.pro/movie/550", testTvUrl: "https://vidlink.pro/tv/1399/1/1", supportsMovie: true, supportsTv: true },
  { id: "moviesapi", name: "MoviesAPI", domain: "moviesapi.to", testUrl: "https://moviesapi.to/movie/550", testTvUrl: "https://moviesapi.to/tv/1399/1/1", supportsMovie: true, supportsTv: true },
  { id: "vidfast", name: "VidFast", domain: "vidfast.vc", testUrl: "https://vidfast.vc/movie/550?autoPlay=false", testTvUrl: "https://vidfast.vc/tv/1399/1/1?autoPlay=false", supportsMovie: true, supportsTv: true },
  { id: "autoembed-co", name: "AutoEmbed", domain: "autoembed.co", testUrl: "https://autoembed.co/movie/tmdb/550", testTvUrl: "https://autoembed.co/tv/tmdb/1399-1-1", supportsMovie: true, supportsTv: true },
  { id: "vidsrc-link", name: "VidSrc Link", domain: "vidsrc.link", testUrl: "https://vidsrc.link/embed/movie/550", testTvUrl: "https://vidsrc.link/embed/tv/1399/1/1", supportsMovie: true, supportsTv: true },
  { id: "vidsrc-wiki", name: "VidSrc Wiki", domain: "vidsrc.wiki", testUrl: "https://vidsrc.wiki/embed/movie/550", testTvUrl: "https://vidsrc.wiki/embed/tv/1399/1/1", supportsMovie: true, supportsTv: true },
  { id: "vidsrcme", name: "VidSrcMe", domain: "vidsrcme.su", testUrl: "https://vidsrcme.su/embed/movie/550", testTvUrl: "https://vidsrcme.su/embed/tv/1399/1-1", supportsMovie: true, supportsTv: true },
  { id: "vidphantom", name: "VidPhantom", domain: "vidphantom.com", testUrl: "https://vidphantom.com/movie/550", testTvUrl: "https://vidphantom.com/tv/1399/1/1", supportsMovie: true, supportsTv: true },
  { id: "yapgrid", name: "YapGrid", domain: "yapgrid.com", testUrl: "https://yapgrid.com/embed/movie/550", testTvUrl: "https://yapgrid.com/embed/tv/1399/1/1", supportsMovie: true, supportsTv: true },
  { id: "videasy", name: "Videasy", domain: "player.videasy.net", testUrl: "https://player.videasy.net/movie/550", testTvUrl: "https://player.videasy.net/tv/1399/1/1", supportsMovie: true, supportsTv: true },

  { id: "ezvidapi", name: "EZVidAPI", domain: "ezvidapi.com", testUrl: "https://ezvidapi.com/embed/movie/550", testTvUrl: "https://ezvidapi.com/embed/tv/1399/1/1", supportsMovie: true, supportsTv: true },
  { id: "vidcore", name: "VidCore", domain: "vidcore.org", testUrl: "https://www.vidcore.org/embed/movie/550", testTvUrl: "https://www.vidcore.org/embed/tv/1399/1/1", supportsMovie: true, supportsTv: true },
  { id: "cinesrc", name: "CineSrc", domain: "cinesrc.st", testUrl: "https://cinesrc.st/embed/movie/550", testTvUrl: "https://cinesrc.st/embed/tv/1399?s=1&e=1", supportsMovie: true, supportsTv: true },
  { id: "vidsrc-mov", name: "VidSrc MOV", domain: "vidsrc.mov", testUrl: "https://vidsrc.mov/embed/movie/550", testTvUrl: "https://vidsrc.mov/embed/tv/1399/1/1", supportsMovie: true, supportsTv: true },
  { id: "cinextream", name: "CineXtream", domain: "cinextream.net", testUrl: "https://cinextream.net/api/embed/movie/550", testTvUrl: "https://cinextream.net/api/embed/tv/1399/1/1", supportsMovie: true, supportsTv: true },
  { id: "embed-api", name: "Embed API", domain: "player.embed-api.stream", testUrl: "https://player.embed-api.stream/?id=550&type=movie", testTvUrl: "https://player.embed-api.stream/?id=1399&s=1&e=1", supportsMovie: true, supportsTv: true },
  { id: "vidapi", name: "VidAPI", domain: "vaplayer.ru", testUrl: "https://vaplayer.ru/embed/movie/550", testTvUrl: "https://vaplayer.ru/embed/tv/1399/1/1", supportsMovie: true, supportsTv: true },
  { id: "1embed", name: "1Embed", domain: "1embed.cc", testUrl: "https://1embed.cc/embed/movie/550", testTvUrl: "https://1embed.cc/embed/tv/1399/1/1", supportsMovie: true, supportsTv: true },
  { id: "iembed", name: "iEmbed", domain: "iembed.codeera.dev", testUrl: "https://iembed.codeera.dev/embed/movie/550", testTvUrl: "https://iembed.codeera.dev/embed/tv/1399/1/1", supportsMovie: true, supportsTv: true },
  { id: "mapple", name: "Mapple", domain: "mapple.uk", testUrl: "https://mapple.uk/watch/movie/550", testTvUrl: "https://mapple.uk/watch/tv/1399-1-1", supportsMovie: true, supportsTv: true },

  { id: "cdn-embed", name: "CDN Brasil", domain: "cdn-embed.com", testUrl: "https://cdn-embed.com/filme/550", testTvUrl: "", supportsMovie: true, supportsTv: false },
  { id: "superflix-pro", name: "SuperFlix", domain: "superflixapi.pro", testUrl: "https://superflixapi.pro/filme/550", testTvUrl: "https://superflixapi.pro/serie/1399/1/1", supportsMovie: true, supportsTv: true },
  { id: "superflix-help", name: "SuperFlix Alt", domain: "superflixapi.help", testUrl: "https://superflixapi.help/filme/550", testTvUrl: "https://superflixapi.help/serie/1399/1/1", supportsMovie: true, supportsTv: true },
  { id: "warezcdn", name: "WarezCDN", domain: "warezcdn.lat", testUrl: "https://warezcdn.lat/filme/550", testTvUrl: "", supportsMovie: true, supportsTv: false },
  { id: "111movies", name: "111Movies", domain: "111movies.net", testUrl: "https://111movies.net/movie/550", testTvUrl: "", supportsMovie: true, supportsTv: false },
  { id: "2embed", name: "2Embed", domain: "2embed.online", testUrl: "https://www.2embed.online/embed/movie/550", testTvUrl: "", supportsMovie: true, supportsTv: false },
  { id: "myembed", name: "MyEmbed", domain: "myembed.biz", testUrl: "https://myembed.biz/filme/550", testTvUrl: "https://myembed.biz/serie/1399/1/1", supportsMovie: true, supportsTv: true },
  { id: "filmesyseries", name: "Filmes & Séries", domain: "filmesyseries.epizy.com", testUrl: "https://filmesyseries.epizy.com/embed-2/?type=movies&imdb=tt0137523", testTvUrl: "", supportsMovie: true, supportsTv: false },
];

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
