# Migração esportiva para Streamed

Concluída em 13/10/2026. A implementação foi baseada em requisições diretas aos endpoints; não foram feitas pesquisas na internet nem consultas à documentação externa.

## Arquitetura e escopo

O projeto usa React 19/TypeScript, rotas App Router e build Vinext/Vite, com execução Node e Worker. A área esportiva já era isolada em `app/sports-view.tsx`, `app/api/sports/route.ts` e `lib/sports-catalog.ts`. Foram mantidos esses contratos e a folha de estilos existente, sem modificar navegação, filmes/séries, autenticação, banco, biblioteca ou recursos sociais.

ScoreBat era exclusivo de futebol e foi removido: consultas live-streams/free-feed, adaptador, conversão de URLs, opção de provedor e variável `SCOREBAT_API_TOKEN`. Não havia dependência npm exclusiva dessa integração, portanto `package.json` e o lockfile não precisaram mudar.

As consultas TheSportsDB das ligas Brasileirão, Premier League, Champions League, NBA e NFL foram substituídas. A TheSportsDB continua para NHL, MLB, Fórmula 1 e ATP, preservando `SPORTSDB_API_KEY` e os feeds adicionais de embeds YouTube/Twitch/Dailymotion/Vimeo. Ela não foi removida porque atende outros esportes. O serviço preservado foi extraído da rota para `lib/legacy-sports-api.ts`.

## Dados reais inspecionados

| Endpoint Streamed | Resposta observada |
| --- | --- |
| `/api/matches/all` | Array com 285 itens; inclui modalidades diferentes e canais com `date: 0` |
| `/api/matches/live` | Array vazio; nenhum jogo ao vivo confirmado na inspeção |
| `/api/matches/football` | Array com 160 itens |
| `/api/matches/basketball` | Array com 13 itens |
| `/api/sports` | Array com 15 modalidades; confirmou `football`, `basketball` e `american-football` |

Em `/matches/all`, foram normalizados 160 itens de futebol, 13 de basquete e 79 de futebol americano. Esses itens podem ser partidas ou canais, conforme publicados pela API; não representam 252 transmissões reproduzíveis confirmadas.

Os campos observados foram `id`, `title`, `category`, `date` em milissegundos, `poster`, `popular`, `teams.home/away.name/badge` e `sources[].source/id`. As referências de imagem retornadas são resolvidas relativamente à origem Streamed. Badges opacos não viraram URLs inventadas. Não foram recebidos placares, competição detalhada ou estado de encerramento; esses dados não são inferidos. `date: 0` é exibido como data a confirmar, e datas passadas sem presença em `/matches/live` ficam com estado não informado.

Foram feitas requisições diretas a `/api/stream/{source}/{id}` usando referências dos próprios JSONs: três fontes de uma partida de basquete, uma de futebol e uma de futebol americano. As cinco respostas forneceram nove streams no total, com `id`, `streamNo`, `language`, `hd`, `embedUrl`, `source` e `viewers`. Todos os nove foram normalizados mantendo o `embedUrl` recebido. As URLs de reprodução não são montadas a partir de IDs.

## Comportamento implementado

- Descoberta pelas cinco rotas solicitadas; modalidade identificada por `category` e validada contra `/sports` quando há modalidades publicadas.
- Futebol americano descoberto em `/matches/all`, sem presumir outro endpoint de partidas.
- Deduplicação por ID Streamed com agregação das referências de fontes.
- Estado ao vivo confirmado exclusivamente pela presença em `/matches/live`.
- Streams buscados apenas para o evento selecionado, via `/api/sports/streams?eventId=…`. A rota valida o ID contra o catálogo e não aceita URLs arbitrárias de consulta.
- Catálogo e streams atualizados a cada 60 segundos enquanto a página está visível, com retomada ao recuperar visibilidade e preservação do evento/player selecionados.
- Cache por endpoint e deduplicação de chamadas simultâneas no servidor: 60 segundos para partidas/streams, uma hora para modalidades, cinco minutos para os esportes preservados. Respostas vazias válidas também são armazenadas.
- Erros HTTP, timeout e JSON inválido tratados; falhas parciais são exibidas. Dados anteriores de descoberta são reutilizados quando possível, com indicação de falha. Sem fontes disponíveis, a partida continua na listagem sem iframe.
- Seleção de todos os streams retornados, idioma/HD, abertura na fonte, recarregamento do iframe e troca manual de stream. Sandbox e permissões existentes foram mantidos.
- `onError` e timeout de 20 segundos tratam falhas detectáveis de carregamento. `onLoad` confirma apenas carregamento do iframe, não reprodução do vídeo. Erros internos de players de outra origem podem exigir troca manual ou abertura na fonte.
- Filtros por futebol, basquete e futebol americano, mantendo filtros temporais, paginação local, cards e layout existentes.

Os caches são em memória por processo/isolate; diferentes instâncias podem consultar a origem separadamente. Não foi adicionada infraestrutura persistente de cache.

## Arquivos alterados e criados

| Arquivo | Mudança |
| --- | --- |
| `app/api/sports/route.ts` | Rota de catálogo delega ao novo serviço |
| `app/api/sports/streams/route.ts` | Nova rota para streams por evento |
| `lib/streamed-api.ts` | Serviço Streamed, cache, chamadas concorrentes e agregação |
| `lib/legacy-sports-api.ts` | Serviço TheSportsDB e embeds preservados para outros esportes |
| `lib/sports-catalog.ts` | Tipos e normalização; remoção de ScoreBat/ligas substituídas |
| `app/sports-view.tsx` | Filtros, polling, streams e estados de carregamento/falha |
| `app/globals.css` | Estilo dos controles e mensagens do player |
| `.env.example` | Remoção da configuração ScoreBat; esclarecimento dos serviços preservados |
| `README.md` | Documentação da integração e limites reais dos dados |
| `tsconfig.json` | Permite imports `.ts` usados nos serviços e testes nativos Node |
| `tests/sports-catalog.test.mjs` | Atualiza cobertura das integrações preservadas |
| `tests/streamed-api.test.mjs` | Novos testes de normalização, cache e falhas |
| `tests/streamed-routes.test.mjs` | Novo teste das rotas no Worker compilado |
| `docs/migracao-streamed.md` | Este relatório |

O relatório anterior `docs/analise-repositorio-esportes.md`, já presente no workspace, não foi alterado; descreve o estado anterior à migração.

## Validação executada

- `npm test`: build Vinext concluído e **50 testes aprovados**, zero falhas.
- `npx tsc --noEmit --incremental false`: aprovado.
- `npm run lint`: zero erros e 26 avisos em arquivos fora da alteração. Após os ajustes finais, lint específico de todos os arquivos TypeScript/JavaScript alterados: zero erros e zero avisos.
- `npm run validate:artifact`: aprovado após o build final.
- `git diff --check`: aprovado.
- Dados reais dos endpoints: inspecionados e normalizados para as três modalidades; URLs reais de nove streams preservadas.

Os testes novos verificam status ao vivo/futuro/desconhecido, data ausente, protocolo seguro, múltiplos streams, respostas vazias/inválidas, indisponibilidade HTTP, manutenção de dados anteriores, cache, deduplicação concorrente, preservação de outro esporte e ausência de busca antecipada de streams. O teste do Worker verifica as rotas de catálogo e streams e respostas 400/404 para IDs inválidos/desconhecidos. Os testes das rotas usam respostas controladas; não dependem da rede.

Não houve validação de reprodução de áudio/vídeo em navegador, interação visual, polling com relógio real, banco real ou deploy. Como `/matches/live` estava vazio na consulta real, a transição para ao vivo foi validada com respostas controladas. A disponibilidade de um `embedUrl` não comprova reprodução, direitos, cobertura geográfica ou disponibilidade futura.

## Atualização: player compartilhado e organização por ligas

Em 13/10/2026, os players esportivos passaram a usar os mesmos componentes de servidores e sandbox de filmes/séries. O menu pesquisável foi extraído de `app/page.tsx` para `app/player-server-menu.tsx`; botão, confirmação e aviso persistente foram extraídos para `app/player-sandbox-controls.tsx`. Ambos os recursos utilizam esses componentes compartilhados.

A confirmação usa um diálogo nativo, com foco inicial em “Manter proteção”, navegação por teclado, cancelamento por Escape e retorno do foco. Desativar exige confirmação; ativar novamente é imediato. O iframe é recarregado ao mudar a proteção. Nos esportes, a autorização para remover o sandbox vale para o evento selecionado: escolher outro evento/filtro restaura a proteção. Os controles esportivos também incluem tela cheia, recarregamento e troca de stream.

A navegação agora separa esporte, liga e status. A listagem é agrupada por esporte/liga, e as opções de liga acompanham o esporte escolhido. Na nova consulta direta a `/api/matches/all`, nenhum item trouxe um campo de liga: nomes de UEFA Champions League e NBA estavam explicitamente presentes nos IDs de algumas fontes; NFL apareceu no título de canais. O adaptador reconhece essas indicações textuais; não presume liga a partir dos times. Sem indicação explícita, o evento permanece em “Liga não informada”. Para os esportes da TheSportsDB, utiliza-se `strLeague` já existente.

Arquivos desta atualização:

- `app/page.tsx`: reutiliza os controles extraídos do player de vídeo.
- `app/player-server-menu.tsx`: novo menu compartilhado, com busca e indicação do servidor selecionado.
- `app/player-sandbox-controls.tsx`: novos controles compartilhados de sandbox.
- `app/sports-view.tsx`: controles do player, tela cheia e filtros combinados.
- `app/globals.css`: adaptações responsivas mantendo os estilos do player existente.
- `lib/sports-catalog.ts`: informação normalizada de liga e reconhecimento de indicações explícitas nos dados Streamed.
- `lib/sports-filters.ts`: novos filtros e agrupamento por esporte/liga.
- `tests/sports-filters.test.mjs`: novos testes das ligas, filtros e grupos.
- `tests/navigation-ui.test.mjs` e `tests/player-sandbox.test.mjs`: acompanham a extração dos componentes compartilhados.
- `README.md` e este relatório: documentação atualizada.

Validação final:

- `npm test`: build concluído e **53 testes aprovados**, zero falhas.
- TypeScript: aprovado.
- Lint completo: zero erros, 25 avisos preexistentes. Lint dos componentes/serviços/testes específicos: zero erros e zero avisos.
- Validação do artefato e `git diff --check`: aprovados.
- Chrome headless, usando a tela esportiva real em uma rota temporária de teste, removida antes do build final: confirmação/cancelamento/reativação do sandbox, foco inicial e teclado, Escape, aviso persistente, busca e seleção de servidores, uso da URL retornada, recarregamento do iframe, entrada/saída de tela cheia, restauração da proteção ao mudar seleção, filtros combinados de esporte/liga/status, estado vazio e agrupamento NFL. Nenhuma exceção JavaScript durante a rodada final.
- Layout verificado em 390, 768 e 1440 pixels, incluindo abertura do menu de servidores no celular e visibilidade do servidor ativo, sem transbordamento horizontal da página.

A verificação de navegador usou eventos derivados dos JSONs reais e respostas controladas para o catálogo e os streams, com um iframe de teste. Ela valida as interações e o layout; não comprova reprodução de transmissões externas reais. A limitação de ausência de teste de interação visual registrada na primeira etapa foi superada por esta rodada; reprodução real, banco e deploy continuam fora da validação executada.

## Atualização: composição visual baseada na referência

A referência enviada foi aplicada à área esportiva mantendo a identidade do Flixa: tema escuro, vermelho de destaque, tipografia existente e componentes compartilhados de servidores/sandbox. O cabeçalho global, a navegação do aplicativo e os demais recursos não foram reconstruídos.

A interface agora possui faixas de esportes e ligas, busca por jogos/times/ligas, player principal com identificação da partida, agenda lateral clicável e cards compactos abaixo. A agenda tem abas de eventos e detalhes, mostra a mesma seleção de filtros dos cards e permite carregar mais partidas. Ao escolher uma partida pela lateral, o player e os indicadores de seleção acompanham o evento escolhido. Na visualização de várias ligas, os cards ocupam uma grade contínua; ao restringir uma liga, aparece o cabeçalho correspondente.

Nos dispositivos menores, a agenda fica abaixo do player e os filtros continuam acessíveis em faixas com rolagem interna. A busca ignora diferenças de maiúsculas/minúsculas e acentos, respeita os demais filtros e oferece uma ação para limpar os filtros quando não encontra eventos.

Os ícones esportivos são SVGs genéricos locais. Times sem URLs de escudos recebidas utilizam monogramas derivados de seus nomes. Não foram inventados escudos, placares, minutos de jogo, estatísticas, escalações ou comentários para reproduzir o conteúdo demonstrativo da imagem. Detalhes não retornados continuam ausentes.

Arquivos desta atualização:

- `app/sports-view.tsx`: composição de transmissão, agenda lateral, busca e faixas de ligas.
- `app/sports-event-summary.tsx`: novo componente de ícones esportivos e identificação dos times.
- `app/globals.css`: estilos responsivos da composição, limitados à área esportiva.
- `lib/sports-filters.ts`: busca local combinada aos filtros existentes.
- `tests/sports-filters.test.mjs`: teste adicional de busca, acentos e combinação de filtros.
- `README.md` e este relatório: documentação da interface.

Validação final: build e **54 testes aprovados**; TypeScript e validação do artefato aprovados; lint completo com zero erros e 25 avisos preexistentes; lint específico dos arquivos desta atualização sem erros ou avisos; `git diff --check` aprovado.

A rodada final no Chrome headless verificou os controles anteriores de sandbox/servidores/recarregamento/tela cheia e os novos fluxos de busca, seleção pela agenda, detalhes, limpeza de filtros e ausência de placares inventados. Também confirmou agenda ao lado do player no desktop, abaixo dele no celular, menu de servidores utilizável e ausência de transbordamento da página em 390, 768 e 1440 pixels, sem exceções JavaScript nessa rodada. A rota de preview foi removida antes do build final. Foram usadas respostas controladas baseadas nos JSONs inspecionados anteriormente, com um iframe de teste; reprodução real de transmissões e deploy não foram executados.

## Correção: escudos dos times

Os identificadores `teams.home.badge` e `teams.away.badge` agora são convertidos para a rota de imagens Streamed verificada com respostas reais: `/api/images/proxy/{badge}.webp`. A resolução limita os identificadores a caracteres seguros e mantém a origem fixa. Campos ausentes ou inválidos não geram URLs de imagem.

O componente compartilhado exibe os escudos na agenda, nos cards e nos detalhes da partida. As iniciais permanecem como fallback para imagem ausente ou erro de carregamento. Dimensões reservadas, carregamento lazy e `object-fit: contain` preservam o layout e a proporção dos escudos.

Arquivos alterados nesta correção: `lib/sports-catalog.ts`, `app/sports-event-summary.tsx`, `app/globals.css`, `tests/streamed-api.test.mjs`, `README.md` e este relatório.

Verificação: os escudos reais de Sabah Baku e Slavia Prague retornaram HTTP 200 e `image/webp`; no Chrome, ambas as imagens efetivamente carregaram na agenda, nos cards e nos detalhes. O fallback foi verificado disparando um erro de imagem controlado. A página também permaneceu dentro da largura de 390 pixels, sem exceções JavaScript nessa rodada. Catálogo controlado com um registro real da API, imagens buscadas diretamente no provedor; isso verifica imagens, não reprodução de vídeo. A rota temporária de preview foi removida.

Build e **55 testes aprovados**, TypeScript aprovado, lint específico sem erros ou avisos, validação do artefato e `git diff --check` aprovados. As duas APIs anteriormente removidas não foram reintroduzidas.
