# Assistir em grupo com CineSrc

## Configuração

Defina `ABLY_API_KEY` no ambiente do servidor. A chave precisa permitir `history`, `presence`, `publish` e `subscribe` nos recursos `watch-party:*`, incluindo os canais terminados em `:chat`. Defina também um `WATCH_PARTY_SECRET` próprio para assinar sessões; se estiver vazio, a assinatura utiliza a chave Ably. Reinicie o servidor após configurar.

Nenhuma dessas variáveis usa prefixo público. O navegador recebe um token request assinado, limitado à sala e à identidade do participante; não recebe a chave secreta. Sem `ABLY_API_KEY`, o endpoint retorna HTTP 503 com `code: "not_configured"` e a interface mostra o motivo. Não cria uma sala fictícia.

## Fluxo

1. Na página Grupo, escolha um filme ou episódio, ou abra Assistir junto no player.
2. Criar sala seleciona CineSrc. Os outros provedores continuam disponíveis fora das salas.
3. O criador é o anfitrião; Copiar convite inclui o código da sala e o filme/episódio na URL.
4. O convidado entra pelo convite completo, autenticado no Flixa. O título e o episódio precisam coincidir com os da sala.
5. Cada pessoa precisa clicar no play dentro do vídeo uma vez quando o navegador bloquear autoplay. Depois a reprodução segue os comandos do anfitrião.
6. O anfitrião controla play, pause e avanço pelo vídeo; também há botões de reproduzir e pausar para todos. O convidado pode conversar no chat e sair da sala.
7. Encerrar sala avisa os convidados e encerra a sessão. Em uma queda temporária do anfitrião, os convidados aguardam até 30 segundos antes de fechar sua conexão com a sala.

Os eventos são validados pela origem `https://cinesrc.st` e pelo `contentWindow` do iframe ativo. Mensagens de controle só são aceitas da identidade do anfitrião. O token do convidado não permite publicar no canal de reprodução; ele publica apenas no canal separado de chat. O backend assina identidades diferentes para anfitrião e convidado e vincula renovações à conta autenticada.

## Sincronização

- Play, pause e seek usam o bridge CineSrc observado no player real.
- A posição considera o tempo transcorrido desde o estado do anfitrião, com relógio sincronizado pelo Ably.
- Mensagens antigas/repetidas são ignoradas pela sequência. A posição é corrigida quando a diferença supera 1,25 segundos.
- O anfitrião atualiza o estado periodicamente, inclusive quando pausado. A presença mantém o último estado para quem entra depois ou reconecta.
- A reprodução continua restrita ao CineSrc; não há troca automática para servidores sem bridge validado.
- Se as durações conhecidas diferirem por mais de cinco segundos, o convidado é pausado e recebe um aviso para escolher a mesma versão. A escolha interna dos servidores do CineSrc pertence ao provedor.
- O sandbox protegido foi mantido. Não foram implementados extensão, extração ou retransmissão de vídeo.

## Validação e limites

Em 13/10/2026:

- Testes unitários verificaram permissões, assinatura de tokens, adulteração/expiração de sessões, validação de estados, identificação de episódios, cálculo da posição e durações incompatíveis.
- A rota compilada foi testada sem credenciais e respondeu `not_configured` sem emitir sala ou token.
- No navegador, o componente real foi testado com um transporte Ably substituído por um broker local de teste: criação do anfitrião, entrada por convite, presença de dois participantes, chat separado e encerramento para ambos. Esse teste não comprova comunicação Ably real.
- O player CineSrc real já respondeu a play, pause e seek na auditoria anterior, documentada em `compatibilidade-assistir-junto.md`.
- A tentativa de verificar controles entre dois vídeos reais não foi concluída: um vídeo permaneceu sem mídia pronta (`readyState=0`) no período de observação. A mídia não foi simulada para declarar sucesso.
- `ABLY_API_KEY` não estava configurada neste ambiente. Ainda é necessário testar a sala com Ably real, duas contas e mídias que carreguem para ambos, incluindo entrada tardia e reconexão.

A sincronização de uma sala não foi anunciada como frame a frame: latência de rede, buffering e disponibilidade do provedor continuam influenciando a reprodução. A configuração da sala não comprova áudio PT-BR ou disponibilidade de todos os títulos.
