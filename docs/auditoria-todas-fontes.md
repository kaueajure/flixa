# Auditoria de todas as fontes: controle interno e extensão

Testes em 13/10/2026, com URLs do inventário atual do Flixa e respostas reais. Foram testadas as **45 fontes/variantes** de filmes e séries: **88 tentativas principais** (45 filmes, 43 séries) e 25 verificações adicionais. Não houve pesquisa externa, documentação externa, mocks de vídeo ou alteração da integração ativa.

## Resultado

- Controle interno por mensagens comprovado em 4 fontes: CineSrc, MoviesAPI, VidZen, VidBolt. São candidatos técnicos; a função de sala do Flixa continua habilitada exclusivamente para CineSrc.
- Extensão MV3 instalada conseguiu controlar vídeo real em 10 fontes/variantes: CineSrc, MoviesAPI, VidZen, YapGrid, VidBolt, VidPhantom Live, VidPhantom Site, VidPhantom Web, VidPhantom XYZ, VidPhantom.
- Áudio dublado PT-BR não foi comprovado. MyEmbed/CDN exibiram a indicação de dublado, mas não carregaram um vídeo controlável nas tentativas; Pomfy não teve reprodução comprovada.
- Os demais resultados são inconclusivos por indisponibilidade, bloqueio de incorporação ou ausência de vídeo pronto. Não são prova de impossibilidade técnica de uma extensão.

## Todas as fontes

Cada célula indica em quais amostras houve play, pausa, seek e avanço real comprovados. “Sem sandbox” corresponde à opção existente no Flixa, avaliada somente no perfil de testes. “Não comprovado” não significa “não suporta”. A coluna de observações reúne falhas de outras amostras da mesma fonte; ela não invalida os sucessos indicados. Os estados completos estão no [JSON de evidências](auditoria-todas-fontes.resultados.json).

| Fonte | Extensão instalada | Controle interno por mensagens | Tentativas | Observações nas demais tentativas |
| --- | --- | --- | --- | --- |
| PipocaCine | Não comprovado | Não comprovado | 2 | Erro HTTP na página/player (HTTP 404) |
| MyEmbed | Não comprovado | Não comprovado | 7 | Erro HTTP na página/player; Página/menu sem vídeo pronto (HTTP 502) |
| CDN Brasil | Não comprovado | Não comprovado | 4 | Página/menu sem vídeo pronto; Erro HTTP na página/player (HTTP 403) |
| Pomfy | Não comprovado | Não comprovado | 5 | Página/menu sem vídeo pronto |
| BetterFlix | Não comprovado | Não comprovado | 2 | Erro HTTP na página/player (HTTP 404) |
| Filmes & Séries | Não comprovado | Não comprovado | 1 | Página/menu sem vídeo pronto |
| VidSrc Wiki | Não comprovado | Não comprovado | 4 | Bloqueio pelo sandbox; Vídeo sem reprodução/controlabilidade comprovada |
| CineSrc | Filme; Série | Filme; Série | 2 | Nenhuma falha nas amostras testadas |
| MoviesAPI | Filme; Série | Filme; Série | 4 | Vídeo sem reprodução/controlabilidade comprovada |
| VidZen | Filme; Série | Filme; Série | 4 | Nenhuma falha nas amostras testadas |
| Videasy | Não comprovado | Não comprovado | 4 | Bloqueio pelo sandbox; Página/menu sem vídeo pronto |
| YapGrid | Filme (sem sandbox) | Não comprovado | 4 | Bloqueio pelo sandbox; Página/menu sem vídeo pronto (HTTP 403) |
| VidBolt | Série (sem sandbox) | Série (sem sandbox) | 4 | Bloqueio pelo sandbox; Página/menu sem vídeo pronto |
| Embos | Não comprovado | Não comprovado | 4 | Bloqueio pelo sandbox; Página/menu sem vídeo pronto; Vídeo sem reprodução/controlabilidade comprovada (HTTP 403) |
| UnlimPlay | Não comprovado | Não comprovado | 2 | Carregamento sem vídeo acessível à extensão; Vídeo sem reprodução/controlabilidade comprovada |
| ScreenScape | Não comprovado | Não comprovado | 2 | Erro HTTP na página/player (HTTP 403) |
| NasriPlay | Não comprovado | Não comprovado | 2 | Vídeo sem reprodução/controlabilidade comprovada |
| FileSuN | Não comprovado | Não comprovado | 2 | Página/menu sem vídeo pronto |
| VidPhantom Live | Filme | Não comprovado | 2 | Bloqueio pelo sandbox |
| VidPhantom Online | Não comprovado | Não comprovado | 2 | Vídeo sem reprodução/controlabilidade comprovada; Bloqueio pelo sandbox |
| VidPhantom Site | Filme | Não comprovado | 2 | Bloqueio pelo sandbox |
| VidPhantom Web | Filme | Não comprovado | 2 | Página/menu sem vídeo pronto |
| VidPhantom XYZ | Filme | Não comprovado | 2 | Página/menu sem vídeo pronto |
| 2Embed Skin | Não comprovado | Não comprovado | 2 | Página/menu sem vídeo pronto |
| 2Embed CC | Não comprovado | Não comprovado | 2 | Página/menu sem vídeo pronto |
| Nontongo | Não comprovado | Não comprovado | 2 | Página/menu sem vídeo pronto |
| PrimeSrc | Não comprovado | Não comprovado | 2 | Página/menu sem vídeo pronto |
| VidLux | Não comprovado | Não comprovado | 2 | Erro HTTP na página/player (HTTP 404) |
| Cinezo | Não comprovado | Não comprovado | 2 | Erro HTTP na página/player (HTTP 403) |
| VidLux Top | Não comprovado | Não comprovado | 2 | Erro HTTP na página/player (HTTP 404) |
| VidLux Quilox | Não comprovado | Não comprovado | 2 | Erro HTTP na página/player (HTTP 404) |
| VidLux Spider | Não comprovado | Não comprovado | 2 | Erro HTTP na página/player (HTTP 404) |
| VidLux Magic | Não comprovado | Não comprovado | 2 | Erro HTTP na página/player (HTTP 404) |
| VidLux Dubai | Não comprovado | Não comprovado | 2 | Erro HTTP na página/player (HTTP 404) |
| VidLux Astra | Não comprovado | Não comprovado | 2 | Erro HTTP na página/player (HTTP 404) |
| VidLux VidRock | Não comprovado | Não comprovado | 2 | Erro HTTP na página/player (HTTP 404) |
| PrimeSrc PrimeVid | Não comprovado | Não comprovado | 2 | Página/menu sem vídeo pronto |
| PrimeSrc Voe | Não comprovado | Não comprovado | 2 | Página/menu sem vídeo pronto |
| PrimeSrc Dood | Não comprovado | Não comprovado | 2 | Página/menu sem vídeo pronto |
| AutoEmbed | Não comprovado | Não comprovado | 2 | Bloqueio pelo sandbox |
| VidPhantom | Filme | Não comprovado | 2 | Vídeo sem reprodução/controlabilidade comprovada |
| VidCore | Não comprovado | Não comprovado | 2 | Vídeo sem reprodução/controlabilidade comprovada |
| Embed API | Não comprovado | Não comprovado | 2 | Erro HTTP na página/player (HTTP 520) |
| iEmbed | Não comprovado | Não comprovado | 2 | Página/menu sem vídeo pronto |
| Mapple | Não comprovado | Não comprovado | 2 | Erro HTTP na página/player (HTTP 403) |

## Método

- Chrome 155 headless, perfil temporário dedicado e extensão Manifest V3 real, injetada em todos os frames, incluindo frames de outros domínios. Nenhuma extensão foi instalada no navegador pessoal.
- Amostras: Clube da Luta (TMDB 550 / IMDb tt0137523), Game of Thrones (TMDB 1399, temporada 1, episódio 1) e Shrek (TMDB 808) nas verificações adicionais das fontes brasileiras. Foram usadas somente URLs já existentes no projeto.
- Wrapper local com iframe, sandbox e política de referência equivalentes ao Flixa. O teste é por provedor; não é uma sessão de duas pessoas no aplicativo. Domínio de incorporação, região, navegador e disponibilidade podem mudar o resultado.
- Extensão: content script no frame do vídeo chamou play(), pause() e alterou currentTime. Sucesso exige mídia pronta, duração conhecida, pausa confirmada, seek para 15 segundos e avanço real após retomar. As evidências guardam os estados antes/depois. Uma promessa resolvida, HTTP 200 ou um elemento video vazio não contam como sucesso.
- Foram tentados cliques normais em controles visíveis de reprodução/servidor, sem remover overlays, bloquear publicidade, extrair mídia, alterar o código do fornecedor ou contornar captchas. Menus com interações adicionais podem exigir nova verificação manual.
- Todas as fontes passaram pela tentativa real de carregamento e inspeção com extensão. Comandos internos foram enviados somente quando havia protocolo identificado; não foram inventados comandos para as demais fontes.
- Controle interno: comandos postMessage com formato observado na integração existente ou no JavaScript efetivamente carregado pelo player. Observou-se o estado real do vídeo após play, pause e seek para 25 segundos. Mensagens de progresso isoladas não comprovaram controle.
- Sem sandbox: verificações adicionais de MyEmbed, CDN Brasil, Videasy, VidSrc Wiki, YapGrid, VidBolt, Embos e Pomfy. Não houve mudança na configuração do site.
- Espera de 35 segundos por tentativa principal; 45–75 segundos em novas verificações. Houve carregamento tardio e buffering em algumas fontes; disponibilidade não é garantida para todo o catálogo.

## Protocolos efetivamente verificados

| Provedor | Mensagem enviada ao iframe | Resultado |
| --- | --- | --- |
| CineSrc | { type: 'cinesrc:command', command: 'play'/'pause'/'seek', args: []/[25] } | Filme e série com sandbox | Nenhuma falha nas amostras testadas |
| MoviesAPI | { action: 'play'/'pause'/'seek', time: 25 no seek } | Filme e série com sandbox, após ampliar espera na série | Vídeo sem reprodução/controlabilidade comprovada |
| VidZen | { command: 'play'/'pause'/'seek', time: 25 no seek } como objeto | Filme e série com sandbox | Nenhuma falha nas amostras testadas |
| VidBolt | { type: 'play'/'pause'/'seek', time: 25 no seek } | Série sem sandbox; filme não comprovado | Bloqueio pelo sandbox; Página/menu sem vídeo pronto |

O primeiro teste de VidZen usou string JSON e ignorou os comandos. O JavaScript servido pelo próprio player revelou que o receptor aceita objetos; a nova tentativa confirmou controle real. Essa descoberta corrige o diagnóstico anterior, mas não altera os adaptadores do aplicativo.

MoviesAPI teve uma tentativa adicional de extensão parcial por não avançar dentro da janela curta após seek; em outra tentativa os quatro controles passaram. Os estados estão preservados no JSON.

## Implicação para assistir em grupo

CineSrc, MoviesAPI e VidZen podem receber comandos do próprio site nas amostras testadas. VidBolt também respondeu na série, exigindo o modo sem sandbox. Para as variantes de VidPhantom e YapGrid com vídeo controlável, a extensão é um caminho técnico comprovado, enquanto o controle interno permanece não confirmado.

Uma extensão não resolve falta de mídia, indisponibilidade do fornecedor ou ausência de dublagem. Deve atuar no frame que contém o vídeo, incluindo domínios internos efetivamente observados, e sincronizar a mesma versão/servidor para todos. CineSrc e outros provedores entregaram durações diferentes para o mesmo filme; sincronizar apenas os segundos entre versões pode mostrar cenas diferentes.

“Controle interno” aqui significa controlar o iframe do fornecedor pela página do Flixa. Um player HTML5 próprio exige uma URL de mídia fornecida e autorizada para esse uso. Esta auditoria não extraiu nem reaproveitou URLs de mídia dos iframes.

Não foram validados áudio por escuta, todo o catálogo, navegadores móveis, extensão de sala pronta para distribuição, duas pessoas sincronizadas, reconexão ou entrada tardia. A extensão criada é somente um instrumento de diagnóstico.

## Testes do projeto e arquivos

- npm test: build aprovado e 68 testes passaram, sem falhas. Esses testes automatizados não são prova de reprodução; a evidência real está nos estados do vídeo registrados pelo Chrome.
- npx tsc --noEmit: aprovado.
- ESLint dos novos scripts: aprovado.
- Os instrumentos de diagnóstico por extensão foram removidos do projeto.
- Relatório e JSON nesta pasta; README recebeu o link da auditoria. Serviços, configurações e UI do site não foram alterados nesta tarefa.

## Repetir a auditoria

O relatório é um registro histórico. A extensão e seus instrumentos de diagnóstico foram removidos; não há download nem integração com extensão no site.
