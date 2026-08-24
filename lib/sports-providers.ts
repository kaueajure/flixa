export type SportsProvider = {
  id: string;
  name: string;
  shortName: string;
  description: string;
  sports: string[];
  officialUrl: string;
  embedUrl?: string;
  locale: string;
  accent: string;
};

export const SPORTS_PROVIDERS: SportsProvider[] = [
  {
    id: "cazetv",
    name: "CazéTV",
    shortName: "CZ",
    description: "Futebol, eventos internacionais e programas esportivos com transmissão brasileira.",
    sports: ["Futebol", "Eventos internacionais", "Debates"],
    officialUrl: "https://www.youtube.com/@CazeTV/streams",
    embedUrl: "https://www.youtube-nocookie.com/embed/live_stream?channel=UCZiYbVptd3PVPf4f6eR6UaQ&autoplay=1&rel=0",
    locale: "Português",
    accent: "#ff5a36",
  },
  {
    id: "canal-goat",
    name: "Canal GOAT",
    shortName: "GOAT",
    description: "Competições nacionais e internacionais, com atenção especial ao futebol feminino.",
    sports: ["Futebol", "Futebol feminino", "Basquete"],
    officialUrl: "https://www.youtube.com/@canalgoatbr/streams",
    embedUrl: "https://www.youtube-nocookie.com/embed/live_stream?channel=UC_oToDrJ6uca7d1dFVBmLtg&autoplay=1&rel=0",
    locale: "Português",
    accent: "#d7ff3f",
  },
  {
    id: "fifa-plus",
    name: "FIFA+",
    shortName: "FIFA+",
    description: "Jogos selecionados, torneios FIFA, arquivos e reprises disponíveis conforme a região.",
    sports: ["Futebol", "Futsal", "Categorias de base"],
    officialUrl: "https://www.plus.fifa.com/",
    locale: "Multilíngue",
    accent: "#20b8f5",
  },
  {
    id: "red-bull-tv",
    name: "Red Bull TV",
    shortName: "RB",
    description: "Eventos ao vivo e reprises de esportes de ação, automobilismo, bike, surfe e padel.",
    sports: ["Automobilismo", "Bike", "Surfe", "Padel"],
    officialUrl: "https://www.redbull.com/br-pt/live-events",
    locale: "Multilíngue",
    accent: "#f7d117",
  },
  {
    id: "olympic-channel",
    name: "Olympic Channel",
    shortName: "OG",
    description: "Competições olímpicas, classificatórias, documentários e replays oficiais.",
    sports: ["Olímpicos", "Paralímpicos", "Classificatórias"],
    officialUrl: "https://olympics.com/pt/olympic-channel",
    locale: "Multilíngue",
    accent: "#9c8cff",
  },
];
