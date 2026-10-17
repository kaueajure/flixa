# DramaBox — integração SDK Node

O acesso atual ao catálogo DramaBox pelo fornecedor Syln está documentado [separadamente](dramabox-via-syln.md). Ele não utiliza este SDK nem resolve seu bootstrap HTTP 403. Os resultados abaixo pertencem à integração direta.

Implementação de 17/10/2026. Pacote instalado e fixado em `@zhadev/dramabox@0.0.2`. Reutiliza serviço, tabelas MySQL, deduplicação, componentes e player vertical existentes. Não usa DramaBos/Syln como intermediários.

## Operações implementadas

O adaptador `lib/miniseries/providers/dramabox.ts` chama os onze métodos solicitados: `getDramaList`, `getLatest`, `getRecommendedBooks`, `getTrending`, `getCategories`, `getBooksByCategory`, `searchDrama`, `getDramaDetail`, `getChapters`, `getEpisodeDetails`, `getStreamUrl`.

Os clientes PT/EN são instâncias reutilizadas, criadas por importação lazy exclusivamente no Node. O Worker recusa a operação antes de carregar o SDK. Tokens ficam na memória do servidor. O idioma solicitado identifica a localização dos metadados; não comprova idioma de áudio. O fallback inglês ocorre após resposta portuguesa válida vazia ou sinopse ausente, nunca para contornar um erro de acesso.

O patch reproduzível `scripts/patch-dramabox.mjs`, aplicado em `postinstall`/`prebuild`, injeta o transporte central com validação TLS normal, desativa retries aninhados e corrige os índices zero. Corrige também a projeção das categorias (`id/name` reais), preserva gêneros/idioma e a paginação da listagem pública. Não altera endpoints, assinaturas nem regras de acesso. Os tipos ausentes no pacote são descritos em `types/dramabox.d.ts`.

## Validação real

Evidência atual: [dramabox-smoke.json](dramabox-smoke.json). Não contém mocks, credenciais ou URLs assinadas. A execução retornou código 1 porque houve operações bloqueadas.

| Operação | Resultado real |
| --- | --- |
| `getCategories(1,30)` | HTTP 200; 50 categorias normalizadas. |
| `getBooksByCategory` | HTTP 200; 23 títulos na categoria retornada pela própria fonte; IDs, nomes, sinopses e contagens normalizados. |
| `getDramaList`, `searchDrama`, `getLatest`, recomendações e populares | SDK executado; bootstrap `POST sapi.dramaboxdb.com/drama-box/ap001/bootstrap` respondeu **HTTP 403**. Os endpoints finais não foram alcançados. |
| `getDramaDetail`, `getChapters` | Tentados com `bookId` obtido da listagem real; mesmo bloqueio no bootstrap. |
| `getEpisodeDetails` | Sem teste ao vivo: nenhum capítulo/índice retornado. Testado com SDK real e HTTP simulado. |
| `getStreamUrl` / player DramaBox | Sem teste de vídeo real: não foi apresentado título com autorização de retransmissão e acesso validado. Compatibilidade MP4 testada de forma simulada. |

Uma execução anterior fez dez requisições HTTP, incluindo tentativas reais de detalhes e capítulos. A execução final usa pausa compartilhada por host: quatro requisições HTTP, com operações subsequentes recusadas pelo bloqueio já conhecido, conforme `suppressedBySharedCooldown` no JSON. Nenhuma chamada à MicroDramaList, Syln ou DramaBos foi realizada pelo smoke DramaBox.

Não há chave DramaBox exigida pelo construtor. O SDK tenta obter uma sessão anônima via bootstrap; **não foi obtida sessão válida neste ambiente**. Preencher uma variável de validação não resolve o HTTP 403. Não foram usados proxies, perfil TLS para evitar WAF, desbloqueio VIP, download ou contorno de DRM.

## Permissões e configuração

Na execução registrada, as consultas reais foram probes efêmeros e não publicaram o catálogo. A configuração atual está em `lib/miniseries/settings.ts`: DramaBox direto desativado, reprodução desativada e lista `dramaBoxMediaHosts` vazia. As opções públicas não ficam na `.env`.

O adaptador, a normalização e os testes permanecem disponíveis. Ativação e hosts CDN são opções no código. Nenhuma chave adicional ou referência de relatório é exigida para habilitar a Syln. O player direto DramaBox permanece indisponível enquanto acesso/reprodução não forem validados; links oficiais são preservados nos metadados conhecidos.

A `.env` fica reservada às credenciais MySQL, tokens e segredos. Para cron, o domínio é lido de `config/app.json` e somente o segredo permanece na `.env`.

## Uso e economia

A tela existente ganhou atualização DramaBox por lista/página, categorias sob demanda e episódios consultáveis sem habilitar reprodução. A busca mantém debounce de 600 ms, usa primeiro registros locais/MicroDramaList e só consulta DramaBox quando necessário. Resultados paginados mantêm o índice de relevância no MySQL.

- Catálogo/listas/buscas/episódios: cache de 24 horas; detalhes/categorias: sete dias. Apenas projeções normalizadas são persistidas quando autorizadas.
- IDs internos e aliases preservados; `platform:dramabox` permite unir fontes pelo ID compartilhado. Nome parecido sozinho não une produções.
- Chaves de cache SHA-256 respeitam as colunas ASCII existentes, incluindo pesquisas com acentos.
- Coalescência de chamadas iguais, leases MySQL entre processos, uma operação SDK por vez, intervalo mínimo de um segundo e teto local conservador de 15 requisições/minuto. Este teto não é uma cota anunciada pelo fornecedor.
- HTTP 429 respeita `Retry-After`; 401/403 pausam aquele host por cinco minutos, sem bloquear o host público de categorias. Até dois retries com backoff apenas em falhas transitórias. Falhas de aplicação/contrato não viram catálogo vazio fictício.
- Capítulos guardam ID, número exibido e índice SDK separadamente. URLs retornadas incidentalmente por capítulos são descartadas. `getEpisodeDetails` não pode iniciar sua consulta implícita de stream.
- Vídeo somente após Play autorizado: revalidação do estado pago/bloqueado, correspondência de capítulo, CDN, validade conhecida e HEAD. MP4 nunca entra no cache persistente ou cache bruto do SDK. Validade ausente/expirada é recusada. O player interrompe a URL expirada.

Exemplos administrativos, uma página por execução:

```bash
npm run miniseries:refresh -- --provider=dramabox --page=1
npm run miniseries:refresh -- --provider=dramabox --feed=latest --page=1
npm run miniseries:refresh -- --provider=dramabox --feed=category --category=698 --page=1
npm run dramabox:smoke
```

A categoria do exemplo foi observada no smoke; a interface usa sempre os IDs da listagem atual. As importações exigem que o provedor esteja habilitado no código. Não existe coleta automática em massa.

## Verificação do projeto

Testes automatizados cobrem adaptador, SDK com HTTP simulado explicitamente, cache, Unicode, deduplicação, seleção de fonte, bloqueios, 429, backoff e MP4. Smoke público é separado desses testes. MySQL real aprovou cache, exclusão mútua e limite atômico de reservas. Resultados finais:

| Verificação | Resultado |
| --- | --- |
| `npm test` (inclui build) | 111 aprovados, zero falhas/ignorados |
| `npx tsc --noEmit --incremental false` | Zero erros |
| `npm run lint` | Zero erros, 28 avisos anteriores |
| `npm run validate:artifact` | Aprovado |
| `npm run miniseries:verify-storage` | MySQL real aprovado: cache, trava e orçamento concorrente |
| Patch em distribuição npm original, ESM/CJS | Reproduzível e idempotente |
| Busca por SDK/autenticação em `dist/client` | Nenhuma ocorrência |
| `git diff --check` | Aprovado |

Filmes/Séries e adaptadores MicroDramaList/Syln/DramaBos não foram reconstruídos. As fontes autenticadas mantêm suas pendências anteriores; regressões automatizadas não são prova de disponibilidade de seus serviços externos.
