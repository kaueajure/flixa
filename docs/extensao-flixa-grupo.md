# Flixa Grupo — extensão Chrome

A página Grupo apresenta o tutorial de instalação e o download em `/downloads/flixa-grupo.zip`. O popup usa o logo, o fundo escuro e o acento violeta do Flixa. Distribuição em Manifest V3, versão 1.0.0, para Chrome em computador; não está publicada na Chrome Web Store.

## Instalação e uso

1. Baixe e extraia o ZIP. Mantenha a pasta `flixa-grupo` no computador.
2. Abra `chrome://extensions`, ative **Modo do desenvolvedor** e clique **Carregar sem compactação**.
3. Selecione a pasta que contém `manifest.json`, não o arquivo ZIP.
4. Volte ao Flixa, abra a extensão no menu de extensões e clique **Conectar ao Flixa**. Autorize o endereço desse Flixa. O site detecta a conexão sem precisar trocar o player.
5. Escolha um filme ou episódio, servidor e áudio. Inicie o vídeo e abra **Grupo** no player. Crie a sala e copie o convite.
6. Os convidados instalam/conectam a extensão, abrem o convite completo, usam a mesma versão/servidor interno e clicam no play uma vez para liberar reprodução/áudio. Somente o anfitrião publica os controles de reprodução.

O popup permite play, pausa e saltos de dez segundos ao anfitrião. Convidados podem usar o chat no Flixa. Convites carregam o modo da sala para preservar a opção CineSrc sem extensão.

## Arquitetura e permissões

- O site continua responsável pela autenticação, tokens restritos do Ably, salas, presença, chat e convites. A extensão não recebe a chave Ably, cookies ou senhas.
- `site-bridge.js` é registrado somente no endereço do Flixa autorizado no popup; valida mensagens da própria janela e a URL do iframe marcado `data-flixa-group-player`.
- O background identifica o iframe escolhido com um vínculo temporário e verifica a árvore dos frames. Relatórios e comandos só passam para esse iframe e seus descendentes nas origens conhecidas. Nenhum comando é aplicado a players de outras abas.
- `media-probe.js` inspeciona elementos video, inclusive em shadow roots abertos, e controla play/pause/currentTime. Conteúdo sem mídia pronta não é apresentado como sincronizável. O detector exige duração conhecida de pelo menos dez minutos para evitar escolher clipes publicitários; vídeos mais curtos não entram nesta versão. A extensão não extrai streams, bloqueia anúncios nem altera o código ou o sandbox dos fornecedores.
- Permissões obrigatórias: activeTab, scripting, storage e webNavigation; acesso aos hosts do inventário e frames internos observados na auditoria. O acesso ao host do próprio Flixa é opcional e solicitado ao conectar. Em endereços locais com porta, como 192.168.15.150:5174, o padrão Chrome abrange o host sem a porta; o background só aceita a origem exata explicitamente conectada. Novos hosts internos precisam entrar na lista antes de serem controlados; não se concede automaticamente acesso a toda a web.
- Estado de seleção fica em storage.session, sem credenciais. O endereço autorizado fica em storage.local para manter a conexão nas visitas seguintes. Desconectar limpa a sessão e remove o acesso opcional à origem.
- Salas em modo extensão preservam o sourceId e providerId. Durações divergentes interrompem a aplicação dos controles no convidado. Sem atualizações do anfitrião por 12 segundos, o convidado pausa até retornar um estado novo.

## Gerar e validar

```sh
npm run extension:build
npm test
```

O prebuild gera novamente o ZIP. O pacote contém apenas os arquivos distribuíveis de `extension/flixa-group`, com providers.js e manifest.json gerados a partir do inventário atual. Não há scripts remotos ou dependências adicionais na extensão. O teste unitário verifica que cada arquivo no ZIP corresponde ao código atual.

Arquivos principais:

- `extension/flixa-group`: manifest, background, bridge da página, controle dos frames, popup, protocolo, assets e README de instalação.
- `scripts/build-group-extension.mjs`: gera permissões, inventário e ZIP.
- `lib/use-party-extension.ts`: detecção, vínculo com o player, comandos e tratamento de desconexão.
- `app/group-extension-guide.tsx`: tutorial e download, também usado no painel do player.
- `app/watch-party-controls.tsx` e `lib/watch-party.ts`: modo extensão, seleção da fonte, estado de sala e opção CineSrc preservada.
- `tests/group-extension.test.mjs`: validação de fontes, frames, mídia, controles e pacote.

## Validação e limites

O build e a suíte de 73 testes passaram. TypeScript e lint dos arquivos novos/alterados passaram. O endpoint local do ZIP respondeu HTTP 200 com Content-Type application/zip. O tutorial foi renderizado em 1280px e 390px, com os seis passos e sem rolagem horizontal.

A extensão de produção foi carregada em um perfil Chrome isolado. Vídeos reais do VidZen foram usados para os comandos em duas abas, em wrappers de teste locais: isso verifica os controles da extensão, não uma conexão real de duas pessoas pela sala Ably. As evidências de reprodução e os limites do teste estão em `extensao-flixa-grupo.browser.json`, quando presentes.

Houve tentativas CineSrc em que só uma das duas mídias ficou pronta. A extensão não transforma uma fonte indisponível em transmissão disponível. Áudio dublado PT-BR, todos os títulos/servidores, Chrome móvel e uma sala de duas pessoas autenticadas pela rede Ably não foram comprovados. O teste local da rota de ticket sem autenticação respondeu 401, como esperado; não foram usadas contas pessoais ou expostas credenciais.

Para executar o smoke test opcional, inicie Chrome em perfil temporário com remote-debugging-port=9228 e enable-unsafe-extension-debugging; rode `node scripts/test-group-extension-browser.mjs`. As variáveis FLIXA_EXTENSION_TEST_SOURCE e FLIXA_EXTENSION_TEST_PROVIDER permitem usar outra fonte real já cadastrada. Esse teste depende da disponibilidade dos vídeos e usa um relay de teste local, não Ably.
