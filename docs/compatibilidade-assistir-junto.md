# Compatibilidade dos players com Assistir Junto

Este diagnóstico inicial foi ampliado pela [auditoria de todas as 45 fontes com extensão instalada](auditoria-todas-fontes.md). Consulte o novo relatório para os resultados atuais, incluindo os protocolos de VidZen e MoviesAPI.

Verificação em 13/10/2026. Foram usadas as URLs já cadastradas no projeto, requisições diretas e Chrome real em modo headless. Não houve consulta a documentação externa, mocks de vídeo, alteração dos players ou desativação do sandbox.

## Escopo e método

- Inventário: 45 entradas de `lib/player-servers.ts`, incluindo variantes de um mesmo provedor. A configuração administrativa do banco pode habilitar/desabilitar entradas; esta auditoria não alterou nem verificou essas escolhas.
- Requisições às URLs de teste de filmes: 30 HTTP 200, 10 HTTP 404, 2 HTTP 403, 1 HTTP 502, 1 HTTP 520 e 1 timeout. HTTP 200 não comprova reprodução.
- Teste aprofundado no navegador: CineSrc, VidZen, MoviesAPI, MyEmbed, CDN Brasil e Videasy. Título de teste: Clube da Luta, TMDB 550.
- Página de teste servida em localhost, com o sandbox protegido do Flixa (`allow-scripts allow-same-origin allow-presentation allow-orientation-lock`), incorporação autorizando autoplay e mídia criptografada e política `no-referrer`.
- Os comandos de mensagens foram exatamente os implementados em `app/watch-party-controls.tsx`. Foram observados os estados reais do elemento de vídeo antes e depois dos comandos.
- A interação inicial foi simulada pelo protocolo de depuração do Chrome com gesto de usuário. Sem interação, o navegador bloqueou play com `NotAllowedError`. O produto precisa permitir que cada convidado inicie seu player.
- O controle direto de vídeo foi executado em um mundo isolado de cada frame via protocolo de depuração. Esse teste avalia a possibilidade técnica de um content script, mas não equivale à instalação e validação de uma extensão.

## Resultados

| Provedor | Comandos atuais do Flixa | Controle direto do vídeo | Resultado |
| --- | --- | --- | --- |
| CineSrc | Play, pause e seek responderam | Funcionou | Candidato validado em uma amostra para integração sem extensão |
| VidZen | Pause e seek foram ignorados | Pause, seek e play funcionaram | Candidato para extensão; adaptador atual não está validado |
| MoviesAPI | Recebeu-se `playerstatus`, mas não houve controle comprovado | Elemento de vídeo encontrado sem mídia pronta | Reprodução e sincronização não comprovadas |
| MyEmbed / CDN Brasil | Nenhuma interface de controle comprovada | Não surgiu vídeo ativo na amostra carregada | Ambos incorporam `playerflix.ink`; é necessário validar o servidor selecionado e os frames internos |
| Videasy | Não testável com vídeo ativo | Não testável | Redirecionou para `player.videasy.to`, que exibiu `Iframe Sandbox Detected` |

### Evidências de reprodução

CineSrc:

- Vídeo com duração 7984 segundos, `readyState=4`, sem erro de mídia.
- Após a interação inicial: `paused=false`, posição 1,893 s.
- Após pause enviado ao iframe: `paused=true`, posição 1,898 s.
- Após seek enviado ao iframe: posição 15 s.
- Após play enviado ao iframe: `paused=false`, posição 16,937 s após aproximadamente 2 segundos.
- Também chegaram mensagens reais `cinesrc:ready`, `cinesrc:response`, `cinesrc:seeking`, `cinesrc:seeked` e `cinesrc:timeupdate`.

VidZen:

- Vídeo com duração 8348,3 segundos, `readyState=4`, sem erro de mídia.
- Após a interação inicial: `paused=false`, posição 1,963 s.
- Pause e seek do adaptador atual não interromperam nem reposicionaram o vídeo: continuou até aproximadamente 4,908 s.
- No controle direto em mundo isolado: pause confirmado, seek para 15 s e reprodução avançando para 15,944 s.
- As mensagens observadas incluíram `type: "vidzen", event: "timeupdate"` e `MEDIA_PROGRESS`, diferentes do `PLAYER_EVENT` esperado pelo adaptador atual.

MoviesAPI:

- Respondeu com `source: "moviesapi-player", event: "playerstatus"`.
- Vídeo permaneceu em `readyState=0`, sem duração conhecida e sem avanço real. `play()` excedeu o limite de espera. Alterar `paused` ou `currentTime` nessa condição não comprova reprodução.

## Limites e próximo passo

As durações de CineSrc e VidZen foram diferentes para o mesmo título. Uma sala deve manter o mesmo provedor e a mesma versão de mídia para todos; sincronizar apenas os segundos entre versões diferentes pode mostrar cenas diferentes.

O próximo passo para uma versão sem extensão é validar CineSrc em duas sessões reais, incluindo entrada tardia, reconexão, buffering e a mídia que o grupo pretende assistir. Para uma extensão, VidZen e CineSrc são os primeiros candidatos para validar permissões e execução nos frames reais.

Esta auditoria não comprovou áudio PT-BR, séries, todos os títulos, dispositivos móveis, duas pessoas sincronizadas ou uma extensão instalada. Na ocasião da auditoria, `WATCH_PARTY_ENABLED` permaneceu `false`. A implementação posterior com CineSrc está descrita em [Assistir em grupo](assistir-junto-cinesrc.md).

A consulta direta a `https://streamed.pk/api/matches/live` respondeu, mas não retornou uma partida das três modalidades iniciais com fonte elegível nessa consulta. Não houve teste de controle ou reprodução esportiva nesta auditoria.
