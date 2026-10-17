# Minisséries — implementação e validação

**Remoção posterior:** DramaBos foi removido do código, configuração, diagnóstico e smoke test. DramaBox direto e via Syln foram preservados. As menções abaixo à integração DramaBos registram a validação histórica, sem representar funcionalidade disponível.

**Atualização mais recente — DramaBox via Syln:** [integração e operação](dramabox-via-syln.md), [evidência real](syln-dramabox-smoke.json). Catálogo, busca, detalhes e episódios autenticados HTTP 200; 46 títulos únicos persistidos, português priorizado, releituras sem chamadas adicionais. Reprodução por título continua bloqueada sem referência de autorização. Os números de testes e pendências dos relatórios abaixo são históricos.

**Atualização DramaBox direto:** veja [a análise da integração independente](dramabox.md). Foi integrado o SDK Node real com cache existente; categorias/listagem por categoria responderam HTTP 200, enquanto operações que dependem do bootstrap responderam HTTP 403. Reprodução pública continua sujeita à autorização e validação. O relatório abaixo registra a implementação inicial dos três fornecedores anteriores.

**Configuração atual:** a Syln usa apenas `SYLN_TOKEN`, com IP autorizado. Os controles adicionais de validação/permissões por `.env` foram removidos. Opções públicas ficam em `lib/miniseries/settings.ts` e `config/app.json`. [Teste autenticado atual](syln-smoke.json): catálogo, detalhes e episódios HTTP 200; 24 títulos persistidos; leitura repetida sem novas chamadas. O relatório HTTP sem autenticação abaixo é histórico.

Verificação realizada em **17/10/2026**, horário de referência America/Sao_Paulo. As observações HTTP reproduzíveis estão em [miniseries-smoke.json](miniseries-smoke.json). Nenhuma resposta simulada foi inserida no catálogo do site. **Reprodução real não foi testada nesta validação.**

## Análise do projeto e integração

O projeto usa React 19, Next/Vinext, Vite, Drizzle e MySQL. A área autenticada é conduzida por hashes em `app/page.tsx`; `/esportes` já redirecionava para sua seção. O servidor também tem execução Node e Worker, com conexões MySQL adaptadas em `withDb`. O middleware de desenvolvimento encaminha as rotas dependentes de MySQL ao Node. As tabelas da biblioteca e do histórico têm enums exclusivos para filmes/séries.

A implementação segue esses padrões: `/#minisseries` e `/#minisseries/ID_INTERNO`, atalho `/minisseries`, navegação desktop/mobile, cards e estilos do catálogo, tipografia existente, boundary de carregamento e `PlayerServerMenu`. A pesquisa pelo botão do cabeçalho e pelos atalhos `/` e Ctrl/Cmd+K direciona ao campo desta seção. Os enums e fluxos de filmes/séries não foram ampliados.

Os adaptadores ficam em `lib/miniseries/providers/`. `service.ts` concentra catálogo, correspondência, permissões e fontes; `transport.ts`, cache e chamadas externas; `db/miniseries.ts`, persistência e coordenação. Não foram adicionados banco, serviço de filas ou infraestrutura externa. A única dependência de reprodução adicionada é `hls.js`, carregada dinamicamente apenas para HLS em navegadores sem suporte nativo.

## APIs e testes reais

| API / endpoint efetivamente chamado | Resultado real | Situação |
| --- | --- | --- |
| MicroDramaList `GET /api/v1/search?q=love` | 200, array de 20 resultados; cabeçalho de limite 30 | Busca pública e normalização validadas sem chave |
| MicroDramaList `GET /api/v1/dramas/mdid-4ztkqf8d` | 200, ID obtido da busca real | Detalhes e normalização validados sem chave |
| Syln `GET /v1/health` | 200, `success: true` | Saúde acessível sem chave |
| Syln `GET /v1/plans` | 200; Lite gratuito, 60 reproduções/hora, uma chave, máximo 480p | Plano confirmado por JSON real |
| Syln `GET /v1/catalog?content_type=short_drama&limit=1` | 401 | Catálogo exige credencial |
| Syln `GET /v1/search?q=love&limit=1` | 401 | Busca exige credencial |
| DramaBos `GET /api/status` | 404, HTML | O endpoint anunciado não funcionou nesse host |

Não havia variáveis de credenciais Syln/DramaBos no ambiente. Os endpoints autenticados de detalhes, episódios e reprodução não foram exercitados com IDs inventados ou retirados de exemplos. Nenhuma URL de vídeo foi solicitada.

Na amostra real da MicroDramaList, `episodeCount` e `releaseYear` estavam nulos, `languages` estava vazio e uma disponibilidade tinha `unverified: true`. Esses campos permanecem desconhecidos. Referências marcadas como não verificadas não geram links públicos nem identificadores fortes para deduplicação.

### Contratos representados nos adaptadores

- **MicroDramaList:** busca retorna um array diretamente, sem envelope; detalhes contêm `alternativeTitles`, `genres`, `episodeCount`, `releaseYear`, `languages`, `availableOn` e IDs externos. Só os dois endpoints públicos solicitados são utilizados. Não há listagem paginada inventada, pesquisa artificial para varrer catálogo ou uso de novos endpoints autenticados.
- **Syln:** catálogo filtra `content_type=short_drama`; respostas precisam ter `success: true`. O ID é opaco, no formato `platform:id`, e `lang` não cria outra produção. A paginação usa `meta.count`, sem inventar total. Episódios têm `ep` e `resolutions`; lista de resoluções vazia bloqueia o episódio. `/play/{ep}` só é chamado após ação explícita, usando o seletor real. URLs, episódio retornado, host e validade são validados. As legendas assinadas vêm apenas da resposta de reprodução. A busca DramaBox via Syln está integrada à busca autenticada existente, após reaproveitamento local e com cache por consulta.
- **DramaBos:** os exemplos publicados não são tratados como respostas reais. O adaptador representa **separadamente** `/dramabox/api/v1/episodes/{id}?page=1` e `/starshort/api/v1/play/{id}/{ep}`. Não presume que DramaBox tenha o endpoint de reprodução de StarShort, nem que StarShort tenha a listagem de episódios de DramaBox. ShortMax usa códigos e FlickReels usa outro caminho; esses contratos não foram generalizados. Autenticação, host operacional e respostas continuam pendentes. O adaptador não tenta outro host automaticamente.

Para StarShort, a lista só pode vir de um mapeamento de episódios revisado e registrado pelo administrador; a documentação não comprova um endpoint de listagem. A validade de URLs DramaBos também não é informada: exige um limite real confirmado, registrado em `validation.playbackTtlSeconds`, antes de disponibilizar a fonte. Isso é uma condição de ativação, não uma alegação de que o fornecedor emita URLs com uma validade presumida. Caso as respostas reais não correspondam ao contrato representado, o adaptador precisa ser ajustado antes da ativação.

## Permissões de uso

| Fonte | Metadados | Imagens | Reprodução em site independente |
| --- | --- | --- | --- |
| MicroDramaList | A [documentação atual da API](https://microdramalist.com/api-docs) declara CC BY 4.0, inclusive uso comercial com atribuição. Crédito e indicação de organização dos dados estão visíveis na seção. | O [aviso de copyright](https://microdramalist.com/dmca) informa que a arte pertence às plataformas. Nenhuma autorização independente de reutilização das capas foi comprovada. | Nenhuma autorização concedida ao Flixa. A permissão de prévias mencionada no site se refere ao próprio promotor/DramaCPS. A integração usa apenas links originais verificados. |
| Syln | Acesso autenticado por token; termos e direitos não são declarados em variáveis de ambiente. | Endereços estáveis e não assinados segundo a documentação, mas isso não comprova direitos de imagem. | Disponibilidade técnica de CDN não comprova licença. Disponibilidade técnica verificada no início da reprodução; sem teste real de vídeo nesta entrega. |
| DramaBos | Sem uso para catálogo, buscas públicas ou sinopses. | Sem uso. | Os [termos](https://dramabos.live/terms-of-service/) reconhecem direitos de terceiros e não concedem autorização explícita ao Flixa. Bloqueada por padrão. |

Capas têm fallback com o título. O sistema não baixa imagens sem permissão e não usa outra API para contornar a falta de direitos. Quando autorizadas, as URLs de capas são lidas do catálogo persistido; o navegador usa o cache do servidor de imagens, sem consulta adicional de metadados por card.

O uso da Syln no projeto depende do token e das respostas reais da API. Não exige declarar permissões em variáveis de ambiente. A disponibilidade de reprodução continua sujeita ao episódio retornado pela fonte, ao formato/host da URL e à sua expiração. Os provedores diretos ainda indisponíveis permanecem desativados no código; isso não transforma a assinatura da API em uma licença de conteúdo.

## Economia de requisições

| Dados / mecanismo | Política implementada |
| --- | --- |
| Catálogo público | Somente leitura do MySQL. Não chama fornecedor em cada visita/renderização. |
| Atualização Syln | Uma página de 24 títulos por comando; cache de 24 horas por página. Aceita páginas 1–10, explicitamente, sem loop automático. |
| Buscas públicas | Resultado local primeiro; MicroDramaList apenas se não houver correspondência local e houver pelo menos três caracteres. Debounce de 600 ms, normalização de espaços/caixa, cancelamento de resposta antiga. |
| Busca remota idêntica | Cache persistente de 24 horas, incluindo respostas vazias. DramaBox via Syln participa quando necessário; DramaBos não participa. |
| Metadados detalhados | Cache de sete dias por ID. MicroDramaList é consultada ao abrir um resultado conhecido; para título Syln sem sinopse, o enriquecimento tenta uma correspondência única e exige evidência forte. Também há enriquecimento administrativo explícito. |
| Episódios Syln | Cache de 24 horas, somente ao escolher uma fonte disponível. Nenhuma lista é solicitada para cards. |
| Episódios DramaBox | Cache de sete dias para a primeira página documentada; não se declara catálogo completo sem validar a paginação real. Essa plataforma não é disponibilizada como player pelo adaptador atual. |
| URLs de reprodução | Nenhuma persistência. POST autenticado somente ao iniciar episódio. Promessas simultâneas para o mesmo usuário/fonte/episódio são compartilhadas; travas no MySQL evitam duplicação entre processos. |
| Assinaturas Syln | Usa `expires_in` real e o parâmetro de validade da URL, adotando o menor prazo com margem de 10 segundos. Links expirados não são reutilizados. Renovação depende de nova ação do usuário; não há loop de reprodução/renovação. |
| Falhas | Cache negativo de 60 segundos; sem retries automáticos. 429 pausa o fornecedor conforme `Retry-After` e reset. Retorno de quota zero também pausa preventivamente. |
| Concorrência | Duas solicitações externas por fornecedor, coordenadas por travas persistentes. Chamadas simultâneas idênticas compartilham a promessa no processo; outro processo recebe cache ou estado temporário de consulta em andamento. |
| Orçamentos locais | MicroDramaList: 15/minuto UTC, até 30 em duas janelas adjacentes. Syln: teto conservador de 50 unidades/hora UTC; consulta reserva 0,05 e emissão de vídeo reserva 1. DramaBos: 900 requisições/mês UTC, abaixo das 1.000 anunciadas. |
| Proteção por conta | Até 30 consultas de busca/minuto e 20 pedidos de reprodução/hora. Limites globais por fornecedor continuam valendo. |

A [documentação Syln](https://syln.dev/docs) informa que consultas custam 1/20 de unidade e que renovações próximas da mesma assinatura podem custar 1/20. O orçamento local reserva conservadoramente 1 por emissão; não presume desconto nem reembolso. Os valores de `RateLimit-*` recebidos continuam sendo a referência da cota real. A [DramaBos anuncia](https://dramabos.live/pricing/) 1.000 requisições mensais, ainda sem autenticação funcional validada.

Os TTLs são políticas locais conservadoras, não uma alegação de que cada fornecedor obrigue esses prazos. Antes de habilitar um contrato privado, confirme também os termos de cache/armazenamento e ajuste-os se necessário. Os metadados permitidos permanecem no catálogo local para reutilização. Cache e contadores antigos são removidos de forma limitada durante atualizações administrativas. A listagem local está limitada a 5.000 registros; não é uma rotina de coleta de 5.000 itens.

O cache admite dados antigos somente dentro de uma janela explicitamente configurada; os conectores atuais não habilitam fallback antigo indefinido. Se o banco falhar, a API apresenta indisponibilidade e não passa a consultar fornecedores sem persistência.

## Deduplicação e episódios

IDs internos são UUIDs persistidos. A união conserva o ID existente e guarda aliases dos IDs absorvidos. A decisão prioriza identificadores externos compartilhados e referências da mesma fonte, sempre incluindo a plataforma para DramaBos. IDs externos contraditórios impedem a união.

Sem identificadores compartilhados, só há união automática por título/alternativo exato normalizado **junto com** ano, idioma conhecido em comum e quantidade de episódios iguais. Similaridade aproximada de nomes não é usada. Correspondências múltiplas sem evidências fortes ficam pendentes de revisão. Resumos da busca MicroDramaList não têm todos esses identificadores; podem precisar dos detalhes antes de uma união segura. Os títulos não são unidos para esconder uma incerteza.

Cada episódio preserva o seletor do fornecedor. Uma chave lógica só é compartilhada entre fontes quando há `episodeMap` revisado (`chave lógica -> seletor real`). Sem mapeamento, a troca de servidor limpa a seleção. O backend confirma novamente que o episódio pertence à fonte daquele título e está disponível antes de solicitar vídeo.

## Configuração e operação

Credenciais ficam na `.env`: `SYLN_TOKEN`, credenciais MySQL e, para cron, `MINISERIES_REFRESH_SECRET`. A importação pelo painel usa a sessão administrativa e dispensa o segredo de cron.

As opções públicas ficam em `lib/miniseries/settings.ts` (provedores e recursos) e `config/app.json` (domínio, proxy, remetente e conexão pública MySQL). MicroDramaList e Syln estão habilitadas. DramaBos e DramaBox direto permanecem desativados até os contratos operacionais estarem disponíveis. O SDK DramaBox e seus testes foram preservados.

Procedimento:

1. Salvar `SYLN_TOKEN` e liberar o IP de saída no painel Syln.
2. Reiniciar o servidor ao alterar credenciais; alterações no código exigem novo build em produção.
3. Atualizar uma página pelo botão administrativo ou `npm run miniseries:refresh -- --provider=syln`. O script usa o domínio de `config/app.json` e o segredo de cron.
4. Agendar uma página por execução, sem coleta em massa. O cache reutiliza a resposta por 24 horas.
5. Enriquecimento e associação explícita continuam nas ações `enrich` e `attach`; os mapas de episódios e a validade de URLs mantêm as validações técnicas existentes.

Rotas internas:

- `GET /api/miniseries`: catálogo/busca local e busca gratuita pontual; `?id=` abre detalhes. Todas exigem sessão.
- `GET /api/miniseries/episodes?id=...&source=...`: apenas fonte configurada e autorizada.
- `POST /api/miniseries/play`: `{id, source, episode}`; sessão, origem, correspondência e direitos conferidos no servidor. Resposta `private, no-store`.
- `GET /api/admin/miniseries`: diagnóstico, flags, direitos, último HTTP, falhas, cooldown e orçamento persistente da janela atual.
- `POST /api/admin/miniseries`: `refresh`, `enrich`, `attach`, `authorizePlayback`, `revokePlayback`. Somente administrador; o segredo de atualização permite apenas `refresh`.

O diagnóstico apresenta orçamentos locais atômicos e cabeçalhos reais recebidos. Totais históricos de requisições são marcados como aproximados; não substituem o consumo contabilizado pelo fornecedor. Nenhuma chave, corpo de erro externo ou URL assinada entra no diagnóstico.

## Validação e pendências

Os testes de normalização, deduplicação, cache, erros, concorrência, limites e seleção de fontes usam respostas **MOCK explicitamente identificadas**. Eles comprovam regras do código e não reprodução real. Os smoke tests usam HTTP real e conferem também a normalização dos dados MicroDramaList recebidos.

O teste opt-in `npm run miniseries:verify-storage` verificou o MySQL real: roundtrip de cache, uma vencedora entre duas tentativas de trava, exatamente cinco reservas aceitas entre doze concorrentes com limite cinco e leitura do catálogo. Os registros temporários de QA foram removidos. Uma disputa de locks encontrada durante a validação foi corrigida com upsert exclusivo antes da reserva transacional.

Resultados finais:

| Verificação | Resultado |
| --- | --- |
| `npm run build` | Aprovado, incluindo as quatro novas rotas de API e `/minisseries` |
| `npx tsc --noEmit --incremental false --pretty false` | Aprovado, sem erros |
| `npm run lint` | Zero erros; 28 avisos: 27 preexistentes e um novo aviso de `<img>` para capas externas, seguindo o padrão existente |
| `node --experimental-strip-types --test tests/*.test.mjs` | **87 aprovados**, zero falhas e zero ignorados; inclui 19 testes novos de Minisséries |
| `npm run validate:artifact` | Aprovado: Worker ESM e manifest presentes |
| Smoke HTTP no servidor Node de produção local | `/minisseries` redireciona com 307 para `/#minisseries`; catálogo sem sessão retorna 401; episódios sem parâmetros retornam 400; diagnóstico sem administrador retorna 403 |
| `npm run miniseries:smoke` | Sete observações HTTP reais, com normalização MicroDramaList aprovada; nenhuma reprodução solicitada |
| `npm run miniseries:verify-storage` | Cache, trava, cota concorrente e leitura aprovados no MySQL real |
| `git diff --check` | Aprovado |

O build emite o aviso habitual de classificação estática incompleta de rotas do Vinext. O navegador da sessão retornou `No browser is available` e a lista de navegadores estava vazia: inspeção visual interativa de desktop/mobile permanece pendente. O player 9:16, MP4/HLS e as legendas estão implementados e compilados, mas continuam pendentes de teste com reprodução efetivamente autorizada, incluindo CORS e expiração reais.

Pendências externas: chaves Syln/DramaBos; contrato de autenticação e host funcional DramaBos; validação autenticada dos dados; direitos independentes de capas e vídeos; mapeamentos entre fontes quando os episódios divergem. O catálogo Syln não é anunciado como sincronizado e nenhuma fonte é anunciada como player operacional nesta entrega.
