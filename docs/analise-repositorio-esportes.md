# Análise do Flixa e fontes para esportes

Data: 13/10/2026. Prioridade informada: vários esportes, com agenda e placares ao vivo.

Este relatório cobre arquitetura, módulos existentes, qualidade técnica e a integração esportiva. As conclusões combinam leitura do código, execução das verificações locais, chamadas aos endpoints públicos existentes e documentação dos fornecedores. Cobertura anunciada por um fornecedor não equivale à validação de cada partida. Não foram testadas contas pagas, transmissão em navegador nem operações reais no MySQL.

## 1. Arquitetura e módulos

| Área | Implementação existente | Implicação para esportes |
| --- | --- | --- |
| Aplicação | React 19, TypeScript, convenções App Router do Next 16, executadas com Vinext/Vite | A integração pode usar componentes e handlers existentes. O build efetivo é Vinext. |
| Navegação | `app/page.tsx`, com 4.262 linhas, centraliza catálogo, busca, detalhes, roleta, player e navegação por hash | Manter a área esportiva em módulos próprios evita ampliar esse arquivo. |
| Entrada pública | Colliepédia antes do login; Flixa após autenticação; metadata inicial de Colliepédia | Essa divisão é explícita no código e nos testes. A área esportiva atual participa do aplicativo autenticado. |
| Filmes e séries | `app/api/movies/route.ts`: listas TMDB, busca, descoberta, gêneros, detalhes, temporadas e episódios | Reaproveitar o padrão de normalização de uma API externa, com IDs e origem definidos. |
| Reprodução | 45 definições em `lib/player-servers.ts`; URLs por TMDB/IMDb montadas no cliente | A seleção de player pode inspirar a experiência esportiva; os IDs de filmes não identificam partidas. |
| Diagnóstico de players | `lib/player-server-health.ts` e `/api/movies/servers`: endpoints, recursos, manifests, áudio, CSP e compatibilidade | Há infraestrutura de diagnóstico; a disponibilidade esportiva precisa ser avaliada por evento. |
| Conta | `db/auth.ts`: scrypt, sessões, cookie HttpOnly/SameSite, recuperação de senha, perfil e presença | Favoritos e preferências esportivas podem usar o usuário existente. |
| Banco | Drizzle/MySQL, migrations de `0000` a `0012`; pool Node e conexão por requisição no Worker | Já existe persistência, mas não há tabelas específicas de esportes. |
| Biblioteca | Lista, estados, favoritos, coleções, episódios, histórico e progresso | Os tipos e tabelas usam filme/série. Não inserir jogos ali como se fossem filmes. |
| Social | Amizades e recomendações de títulos, com validação de amizade e resolução TMDB no servidor | Recomendação de jogos exige ampliar o contrato de conteúdo. |
| Retrospectiva | Sessões de visualização, segundos assistidos e distinção de progresso real/estimado | Eventos esportivos precisariam de métricas próprias se incluídos nesse recurso. |
| Administração | Usuários, presença, servidores de reprodução, diagnósticos e validação de catálogo | Pode receber configuração de ligas e indicadores de saúde das fontes esportivas. |
| Assistir Junto | Implementação Ably presente, desabilitada por `WATCH_PARTY_ENABLED=false` | Não contar com sincronização de transmissões como recurso disponível. |
| Execução | Worker Cloudflare e servidor Node/Hostinger `server.cjs`; plugin Vite atende determinadas APIs no Node | Homologar esporte nos dois runtimes. `/api/sports` não está na lista interceptada pelo plugin MySQL. |

As credenciais TMDB e MySQL estão presentes no `.env.local` inspecionado. Variáveis de TheSportsDB, ScoreBat e embeds esportivos não aparecem nesse arquivo; portanto, ele não configura essas integrações opcionais. Isso não determina quais variáveis existem na hospedagem. Os valores das credenciais não foram expostos.

## 2. Como filmes e séries funcionam hoje

O fluxo é: TMDB → normalização do catálogo → listas e detalhes → seleção de provedor externo → iframe. O MySQL guarda conta e estado do usuário, além da configuração e dos diagnósticos de servidores.

Há uma distinção importante no código: `markProviderAvailability()` e `/api/movies/availability` consideram quantidade de servidores habilitados compatíveis com o tipo de mídia. Isso não confirma que cada título reproduz em cada servidor. Os diagnósticos de reprodução são uma etapa diferente.

Para esportes, o equivalente adequado é: API de competições/partidas → evento normalizado → agenda e placar → fonte de vídeo associada à partida, quando disponível. Um placar ao vivo não prova que exista transmissão incorporável.

## 3. Área esportiva existente

Arquivos principais:

- `lib/sports-catalog.ts`: tipos, nove ligas fixas, adaptadores TheSportsDB/ScoreBat, conversão de URLs de vídeo e deduplicação.
- `app/api/sports/route.ts`: 18 consultas TheSportsDB, feeds opcionais ScoreBat, associação de embeds por ID e cache de cinco minutos.
- `app/sports-view.tsx`: filtros Todos/Ao vivo/Próximos/Já passaram, cards, placar, detalhes e iframe.
- `app/esportes/page.tsx`: redirecionamento para `/#esportes`.
- `tests/sports-catalog.test.mjs`: oito testes de catálogo e mapeamento.

Já existe suporte a YouTube, ScoreBat, Twitch, Dailymotion e Vimeo como destinos de embed. Isso é suporte a formatos de URL; não são cinco serviços que descobrem automaticamente transmissões de uma partida. A associação adicional é manual ou vem de um feed configurado em `SPORTS_AUTHORIZED_EMBEDS_JSON`/`SPORTS_AUTHORIZED_EMBEDS_URL`.

### Verificação dos endpoints atuais

Executei 27 chamadas públicas: lookup da liga, próximos eventos e eventos passados para cada ID. Todas responderam HTTP 200; os nove IDs corresponderam às competições esperadas.

| Competição | ID TheSportsDB | Próximos retornados | Passados retornados |
| --- | --- | ---: | ---: |
| Brasileirão Série A | 4351 | 1 | 1 |
| Premier League | 4328 | 1 | 1 |
| Champions League | 4480 | 1 | 1 |
| NBA | 4387 | 1 | 1 |
| NFL | 4391 | 1 | 1 |
| NHL | 4380 | 1 | 1 |
| MLB | 4424 | 1 | 1 |
| Fórmula 1 | 4370 | 1 | 1 |
| ATP World Tour | 4464 | 0 | 1 |

Exemplo retornado pelo fornecedor: Mirassol vs Internacional, em `2026-10-16`, às `23:00:00` UTC. São dados recebidos da API, sem confirmação independente da programação pela organização do campeonato.

### Problemas que impedem uma experiência completa

1. **Não consulta livescores.** O backend usa apenas `eventsnextleague.php` e `eventspastleague.php`; o estado ao vivo depende dos campos eventualmente presentes nesses feeds.
2. **A tela busca uma única vez.** O efeito de carregamento não tem polling, atualização ao recuperar foco ou atualização manual.
3. **Cache de cinco minutos para tudo.** Agenda, resultados, placar e vídeo compartilham a mesma validade, sem diferenciação de frequência.
4. **Sem calendário navegável.** Há uma lista de cards, mas nenhum seletor de dia/semana, intervalo, esporte ou competição. “Mostrar mais” apenas revela itens já carregados.
5. **Cobertura fixa.** A lista inclui nove competições; não oferece descoberta de novas ligas.
6. **Deduplicação perde atualizações.** O merge por título normalizado e dia preserva os campos do primeiro evento; só agrega fontes de vídeo. Reproduzi um evento `upcoming` seguido pelo mesmo confronto `live`, com placar 2×1: o resultado continuou `upcoming`, sem placar.
7. **Status depende demais do feed.** Um registro `FT` recebido no feed de próximos é mapeado para `upcoming`. Cancelamento e adiamento não têm estados próprios.
8. **Replay não está comprovado.** Associar um canal Twitch a evento encerrado promove automaticamente seu status a `replay`; o canal pode não conter a gravação daquele jogo. Um vídeo de melhores momentos também recebe esse rótulo.
9. **ScoreBat usa janela temporal como estado.** O código considera “ao vivo” o item iniciado nas últimas seis horas, sem confirmar que continua em andamento. Reproduzi também um item do feed live quatro minutos antes do início: ficou `replay`.
10. **Data ausente vira 1970.** Uma partida sem timestamp nem data recebe `1970-01-01`, exibida como data válida. Deve haver horário/data a confirmar.
11. **Fusão entre fontes é frágil.** Nomes traduzidos, abreviações e mandante/visitante invertidos podem duplicar jogos; mesmo título/dia em competições diferentes pode causar fusão indevida. IDs ScoreBat podem depender do vídeo selecionado.
12. **Estado de saúde pouco visível.** A resposta contém `errors`, mas a tela não apresenta erros parciais. Se todas as fontes falham, um cache expirado não é devolvido como último dado conhecido.
13. **Configuração não comprova vídeo.** `liveSourceConfigured` indica presença de configurações, sem validar plano, entradas de embed ou reprodução.
14. **Falha de iframe não é confiável para troca automática.** O `onError` não cobre todos os bloqueios e erros internos de players de outra origem; é preciso estado por fonte e mensagens do player quando suportadas.

Os casos de status, fusão, canal e data foram reproduzidos executando as funções atuais, sem alterar o aplicativo.

## 4. Fontes reais pesquisadas

Preços consultados em 13/10/2026, em moeda do fornecedor. Escolha de plano e disponibilidade precisam ser confirmadas na conta contratada.

### TheSportsDB — primeira opção para vários esportes

Dados de ligas, equipes, eventos, temporadas, programação de TV e imagens. A documentação oferece calendário por dia/temporada, agenda completa V2 e livescores, com autenticação V2 por `X-API-KEY`. O limite gratuito dos endpoints de próximos/passados é um evento; usar essa chave não entrega calendário completo. [Documentação](https://www.thesportsdb.com/documentation).

O plano Single Developer custa US$9/mês; Small Business, US$20/mês. Ambos anunciam livescores a cada dois minutos para futebol, NFL, NBA, MLB e NHL. Isso não anuncia livescores de F1 ou tênis. Escolher o plano conforme o uso do Flixa e validar as ligas pretendidas. [Preços e cobertura ao vivo](https://www.thesportsdb.com/pricing).

**Avaliação para o projeto:** exige menos adaptação porque a integração e os IDs já existem. Calendário e livescore devem ser consultados separadamente. Programação de TV serve para informar canais, sem garantir um player.

### API-SPORTS / API-Football — alternativa para maior detalhamento

API-Football oferece fixtures, livescore, classificação, eventos e escalações. Plano gratuito: 100 chamadas/dia, com restrição de temporadas. Pro: US$19/mês e 7.500 chamadas/dia. Verificar acesso à temporada corrente antes de escolher o gratuito. A família API-SPORTS lista produtos de NBA, NFL, basquete, hóquei, beisebol, F1 e outros; verificar plano e cobertura de cada produto separadamente. [Planos](https://www.api-football.com/pricing).

**Avaliação:** boa candidata para aprofundar futebol ou modalidades específicas, com adaptadores por esporte. Não usar o preço do Football como orçamento automaticamente válido para todas as modalidades.

### football-data.org — alternativa para calendário de futebol

O catálogo gratuito inclui Brasileirão Série A, Champions League e grandes ligas europeias. [Cobertura](https://www.football-data.org/coverage). O plano gratuito oferece agenda, classificação e placares com atraso, a dez chamadas/minuto. A opção com livescores dessas 12 competições custa €12/mês, com possíveis impostos. [Planos](https://www.football-data.org/pricing).

**Avaliação:** útil para uma opção gratuita de calendário de futebol. Não atende sozinho à prioridade de vários esportes.

### Sportmonks — alternativa de futebol

Starter a €29/mês, com cinco ligas escolhidas e 2.000 chamadas por entidade/hora. Oferece fixtures, placares e estatísticas; confirmar cobertura das ligas selecionadas. [Planos](https://www.sportmonks.com/football-api/plans-pricing/).

**Avaliação:** considerar caso a profundidade de dados de futebol justifique outra integração.

### ScoreBat — vídeo de futebol, separado da agenda

Já há adaptador no Flixa. O plano gratuito dá acesso apenas ao Free Feed; Starter custa US$69/mês e inclui o endpoint Live Streams, com 5.000 créditos mensais. As transmissões dependem das competições e jogos disponíveis. [Recursos e planos](https://www.scorebat.com/video-api/).

A documentação confirma `/video-api/v3/free-feed/` e `/video-api/v3/live-streams/`, ambos com token. O primeiro fornece destaques selecionados; o segundo inclui partidas ao vivo e já encerradas, com itens surgindo aproximadamente cinco minutos antes do início. Logo, pertencer ao feed live não prova que a partida esteja em andamento. [Documentação](https://www.scorebat.com/video-api/docs/).

**Avaliação:** fonte de vídeo aproveitável, sem promessa de todos os jogos. Conferir orçamento de créditos: uma consulta contínua a cada cinco minutos usa 8.640 chamadas em 30 dias; isso precisa ser convertido conforme a regra de créditos do plano, antes de habilitar polling.

### YouTube — transmissões publicadas por canais selecionados

A Data API permite restringir busca a canal e a eventos `live`/`upcoming`, com `type=video` e `videoEmbeddable=true`. [Documentação de busca](https://developers.google.com/youtube/v3/docs/search/list).

**Avaliação:** usar canais de publicadores identificados e associar o vídeo ao evento. A descoberta precisa de credencial e controle de quota. Um canal não é uma transmissão específica; confirmação de embeddability e disponibilidade deve ocorrer antes de exibir “Assistir”.

### OpenF1 — complemento especializado

API de telemetria, tempos e sessões. Histórico desde 2023 gratuito, dados em tempo real mediante assinatura. É um projeto independente, não uma API oficial da Formula 1. [Documentação](https://openf1.org/docs/).

**Avaliação:** candidato a uma experiência específica de corrida, sem vídeo. Não substitui a agenda geral de várias modalidades.

## 5. Recomendação e implementação proposta

**Começar com TheSportsDB Premium para calendário e placares de várias modalidades, mantendo vídeo como integração independente.** Validar em uma conta real a cobertura das competições prioritárias, datas, resultados e estados. Para F1/tênis, sinalizar corretamente o nível de cobertura e escolher complemento após validação.

Ordem de trabalho:

1. **Corrigir o modelo de evento.** Guardar provedor e ID externo, liga/equipes identificadas, horário conhecido ou a confirmar, estado da partida, placar, período e horário de atualização da fonte. Distinguir transmissão, replay completo e melhores momentos em campos de mídia, separados do estado esportivo.
2. **Completar os adaptadores.** Aproveitar TheSportsDB para agenda completa e adicionar livescore V2. Começar por futebol/NBA/NFL/MLB/NHL cobertos no plano; preservar resultados específicos para corridas e torneios, que não se resumem a placar mandante/visitante.
3. **Corrigir identidade e merge.** Chave primária por provedor/ID; relacionamentos explícitos entre provedores. Atualizar placar e status pela fonte mais recente, preservando associação de vídeos.
4. **Separar caches.** Agenda com validade maior; livescore alinhado aos dois minutos anunciados; vídeo conforme disponibilidade e quota. Reutilizar resposta entre usuários, deduplicar requisições concorrentes e compartilhar cache se houver múltiplos processos/instâncias. Preservar último dado conhecido com indicação de atraso quando houver falha.
5. **Adicionar atualização da tela.** Atualizar enquanto a área está visível, ao recuperar foco e por ação manual, preservando evento e player selecionados.
6. **Adicionar calendário e listas.** Hoje, próximos sete dias, resultados, ao vivo; seleção de data, esporte e campeonato. Horário exibido em São Paulo, com conversão correta de dias próximos à meia-noite.
7. **Associar vídeo específico.** ScoreBat quando o plano fornecer o evento; YouTube quando houver uma transmissão identificada. Se houver apenas placar, mostrar acompanhamento e canais conhecidos, sem anunciar vídeo disponível.
8. **Configurar operação.** Credenciais no servidor, seleção de ligas, limites de requisição, latência, última sincronização, quota e falhas por fonte. Confirmar leitura de credenciais nos runtimes Node e Worker.

Os arquivos de esporte existentes permitem entregar a primeira versão sem refatorar todo o catálogo. Persistência esportiva no MySQL passa a fazer sentido para cache compartilhado, relações entre fontes, favoritos de equipes, ligas seguidas e lembretes; o schema atual de filme/série precisa permanecer coerente.

## 6. Qualidade técnica e validação

- `npm run build`: passou, gerando Worker e artefatos cliente/servidor.
- `npm run validate:artifact`: passou.
- `npx tsc --noEmit --incremental false`: passou.
- `npm run lint`: zero erros, 26 avisos, principalmente imagens e dependências de hooks.
- `node --experimental-strip-types --test tests/*.test.mjs`: 47 testes passaram, incluindo nova execução após o build.

Os testes atuais combinam verificações de texto-fonte, testes de funções e um teste de HTML do Worker. Eles não validam cobertura esportiva de produção, quotas pagas, banco real ou transmissão em navegador. Os oito testes esportivos não cobrem as reproduções problemáticas listadas acima.

Pontos gerais de manutenção: o arquivo principal concentra responsabilidades; as rotas de filme têm cache em memória e a disponibilidade do catálogo indica capacidade de provedor, sem prova de reprodução por título. A parte esportiva deve manter módulos próprios e semântica mais precisa de disponibilidade.

Para a implementação, verificar casos reais de início, intervalo, encerramento, adiamento/cancelamento, mudança de data e falha parcial; testar associação de fontes, atualização de placar sem reiniciar player, fuso horário, quota e retomada após falha. Este trabalho produziu o diagnóstico e a proposta; a funcionalidade de produção continua no estado analisado.
