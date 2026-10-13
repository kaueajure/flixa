# Flixa

Plataforma de entretenimento com catálogo de conteúdo, biblioteca pessoal, recursos sociais e uma área de esportes com agenda, resultados e vídeos quando a fonte permite incorporação.

## Funcionalidades

- catálogo e descoberta de conteúdo
- biblioteca pessoal
- perfis e configurações de usuário
- amigos e recursos sociais
- comunidades e fóruns
- área administrativa
- agenda esportiva e resultados
- reprodução por embeds externos quando compatível
- assistir em grupo com CineSrc, convites, chat e controles do anfitrião (requer Ably)

## Stack

- Next.js 16
- React 19
- TypeScript
- Drizzle ORM
- MySQL
- Ably
- Tailwind CSS
- Cloudflare / Wrangler

## Rodando localmente

Requisitos:

- Node.js 22.13 ou superior
- npm

```bash
git clone https://github.com/kaueajure/flixa.git
cd flixa
npm install
cp .env.example .env
npm run dev
```

As integrações externas são opcionais e devem ser configuradas no `.env` conforme necessário.

## Assistir em grupo

A página Grupo e as salas são restritas a administradores. A sincronização usa o player CineSrc. Configure `ABLY_API_KEY` e `WATCH_PARTY_SECRET` no servidor.

## Banco de dados

O projeto usa Drizzle para schema e migrations.

```bash
npm run db:generate
npm run db:migrate
```

Para popular dados de desenvolvimento:

```bash
npm run db:seed
```

## Esportes

Futebol, basquete e futebol americano usam diretamente a Streamed API: `/api/matches/all`, `/api/matches/live`, `/api/matches/football`, `/api/matches/basketball` e `/api/sports`. As fontes de cada partida são resolvidas por `/api/stream/{source}/{id}`; o player utiliza exclusivamente o `embedUrl` recebido.

A TheSportsDB permanece para NHL, MLB, Fórmula 1 e tênis (`SPORTSDB_API_KEY`, padrão público `123`), com os embeds adicionais existentes. ScoreBat foi removido. Não são necessárias credenciais para a Streamed.

O catálogo atualiza a cada 60 segundos enquanto a página está visível. O servidor compartilha requisições concorrentes e guarda catálogo/streams por 60 segundos, modalidades por uma hora e demais esportes por cinco minutos. Streams são consultados somente para a partida selecionada. Respostas vazias válidas são aceitas; falhas parciais aparecem na tela e dados anteriores são mantidos quando possível.

A Streamed não forneceu placares nem confirmação de encerramento nos JSONs inspecionados. O estado ao vivo depende de `/matches/live`; partidas sem confirmação ficam com estado não informado. `date: 0` aparece como data a confirmar. Não são presumidos resultados ou replays.

A listagem é separada por esporte e liga, com filtros de status independentes. TheSportsDB fornece os nomes das ligas dos esportes preservados. Na Streamed, nomes explícitos em títulos e IDs das fontes permitem identificar UEFA Champions League, NBA e NFL; eventos sem essa indicação ficam em “Liga não informada”. Não são deduzidas ligas pelos nomes dos times.

Os players esportivos compartilham com filmes e séries o menu pesquisável de servidores e os controles de sandbox. A proteção começa ativa, só é removida após confirmação e pode ser reativada no aviso persistente. Ao selecionar outro evento, a proteção volta a ficar ativa. Há recarregamento, troca de stream e tela cheia.

A interface esportiva segue uma composição de transmissão: faixas de esportes e ligas, player principal, agenda lateral e cards compactos de partidas. A busca por jogos, times ou ligas filtra agenda e cards em conjunto. Em telas pequenas, a agenda fica abaixo do player. Placar, local e demais detalhes aparecem apenas quando fornecidos; os escudos da Streamed são exibidos pela rota de imagens verificada, com monogramas quando ausentes ou quando o carregamento falha.


## Vídeo

Embeds externos são carregados em `iframe` com restrições de segurança. Provedores que exigem pop-up, bloqueiam incorporação ou não são compatíveis ficam desativados.

## Build e testes

```bash
npm run build
npm run validate:artifact
npm run lint
npm test
```

Para iniciar o build gerado:

```bash
npm start
```
