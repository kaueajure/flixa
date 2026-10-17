# ReelShort no Flixa

Implementação de 17/10/2026. Reutiliza MySQL, transporte, deduplicação, administração, cards, fontes e player vertical. Syln, MicroDramaList e DramaBox foram preservados. DramaBos continua removido conforme a solicitação anterior.

## ReelShort direto: validação real

Código adaptado do [repositório autorizado](https://github.com/wanglinsaputra/Rest-Api-ReelShort), commit `95d04d04400bcfc4ce2c77583b1b9702d994fc19`; licença MIT em [third_party/reelshort/LICENSE](../third_party/reelshort/LICENSE). Os serviços foram incorporados ao backend Node, sem instalar Express, Axios ou outra infraestrutura. Não depende de instância de terceiros nem de chave própria.

O projeto original lê dados públicos do site ReelShort. O Flixa conserva esse transporte, com TLS normal e sem sessão privilegiada, mas corrige a leitura de `props.pageProps` na página inicial, identifica as estantes portuguesas reais e elimina o build ID fixo usado como fallback no projeto original. Falhas HTTP/contrato geram erro, não respostas vazias fictícias. Não utiliza desbloqueio, DRM, proxies ou perfis TLS especiais.

Operações reais verificadas:

| Operação equivalente ao contrato fornecido | Resultado |
| --- | --- |
| `newrelease` | 10 títulos retornados pela estante portuguesa. |
| `recommended` | 16 títulos. |
| `dramadub` | 10 títulos. |
| `search` | 12 resultados para “Casei-me com o Mafioso que Salvei”, incluindo duas versões com IDs distintos. |
| `episodes` | Versão dublada `69eb2ff86df2b6f27b081cb3`: 54 episódios regulares; 11 acessíveis, 43 bloqueados a partir do episódio 12. Trailer de índice zero excluído. |
| `video` | Episódio 1, capítulo `p3a5e6mo2i`: resposta HTTP 200 e URL HLS real. |
| Player | Chrome headless carregou e reproduziu vídeo 720×1280, avançando mais de cinco segundos, sem erro de mídia. |
| Releitura | Zero chamadas extras para as operações de metadados repetidas. |

As páginas inicial, busca, detalhes e episódio responderam HTTP 200 nos probes reais. As rotas `/api/v1/reelshort/*` não são outro servidor: seus serviços equivalentes são executados diretamente pelo adaptador. A implementação usa o build ID obtido da página pública, nunca um valor inventado. O cache final reutiliza as respostas normalizadas dos probes anteriores; o campo `requests` do relatório registra somente as chamadas adicionais daquela execução.

O teste usou o título indicado pelo usuário e uma autorização temporária restrita à execução, sem gravar uma licença pública no banco. O seletor e o player são os mesmos componentes usados na página do Flixa. O teste local passou pela seleção da fonte, seleção do episódio e clique em Iniciar; nenhuma URL foi requisitada antes desse clique. O backend real validou correspondência, disponibilidade e autorização. O teste usou um servidor QA temporário em localhost, sem autenticação da sessão normal do site; não representa teste de login ou publicação em produção.

Relatório: [reelshort-live-smoke.json](reelshort-live-smoke.json). Nenhuma URL de vídeo ou credencial é gravada nele. O episódio testado anunciou apenas uma qualidade; a troca entre variantes reais não pôde ser validada nessa amostra. O suporte a qualidades e MP4 tem testes simulados identificados. O endereço HLS observado não anunciava prazo de assinatura; a sessão local do player é limitada a cinco minutos, sem afirmar que esse seja o prazo do fornecedor. Assinaturas com validade conhecida têm o menor prazo aplicado com margem; validade desconhecida em URL com parâmetros é recusada. Vídeos nunca entram no cache persistente.

## Operação e economia

- No catálogo existente, filtro **ReelShort direto**; busca com o debounce existente de 600 ms.
- Administração: atualização ReelShort. `refreshExternal` aceita os três feeds ReelShort; não há paginação remota inventada para eles. A navegação local pagina em blocos de 24.
- Catálogo, pesquisas e episódios: cache MySQL de 24 horas. Descoberta do build/estantes ReelShort: uma hora. Resultados vazios e índices de relevância também são reaproveitados.
- Não há busca por card, loop de coleta, consulta a todos os provedores nem busca automática de IDs ausentes nas estantes. Registros sem ID são omitidos.
- IDs internos permanecem estáveis. Apenas IDs nativos explícitos (`book_id` ReelShort, `bookId` DramaBox) são usados como evidência forte para deduplicar com outras fontes. Nome parecido não basta.
- `book_id`, `filtered_title` e `chapter_id` são preservados no servidor. Número exibido e capítulo são usados na solicitação exata; não há troca implícita de episódio.
- Limite local conservador: dez chamadas por minuto para cada integração, não uma cota declarada pelo fornecedor. Reutiliza duas posições de concorrência, deduplicação de operações e leases MySQL. HTTP 429 aplica pausa conforme `Retry-After`, sem retries em loop.
- `videoUrl`, `qualityList` e legendas são normalizados somente no Play. Qualidades retornadas têm seleção no player; HLS.js oferece seleção das variantes realmente anunciadas pelo manifesto. HLS nativo continua disponível; nesse modo, variantes sem URLs separadas ficam sob seleção do navegador.
- Ao mudar qualidade, preserva a posição. URLs expiradas interrompem o vídeo; falhas de CORS/rede não são contornadas por proxy. MP4 continua direto, HLS usa suporte nativo ou `hls.js` existente.

O cache de fornecedor contém somente projeções normalizadas, sem URLs incidentais de capítulos, tokens ou autorizações de distribuição. Autorizações ficam exclusivamente na fonte do título no armazenamento existente e são omitidas das respostas públicas.

## Exibição e permissões

ReelShort direto está habilitado para metadados. Capas das novas fontes ficam desativadas até haver permissão; informações já permitidas por outras fontes continuam reaproveitadas. O direito de uso do código MIT não concede direitos sobre vídeos ou imagens.

A autorização por título/fonte já existente agora contempla o adaptador ReelShort: `authorizePlayback` e `revokePlayback` em `POST /api/admin/miniseries`, com sessão administrativa. Referência, data de verificação e eventual expiração são armazenadas na fonte do título, sem novas tabelas ou flags na `.env`. O teste real não cadastrou uma liberação pública. Sem autorização, o servidor recusa Play antes de consultar a URL. Links originais verificados permanecem disponíveis.

Comandos:

```bash
npm run reelshort:smoke
# Apenas se este título continuar autorizado para teste:
npm run reelshort:smoke -- --authorize-title='Casei-me com o Mafioso que Salvei' --player
```

O teste de navegador opt-in requer Chrome local. O navegador integrado não estava disponível; foi utilizado Chrome headless instalado, com perfil temporário removido ao final. Ele não é dependência do servidor de produção.

## Verificação final

| Verificação | Resultado |
| --- | --- |
| Build de produção | Aprovado; aviso conhecido do Vinext sobre classificação estática de rotas. |
| Suíte completa | 129 aprovados, zero falhas e zero ignorados, incluindo sete testes da integração ReelShort. |
| TypeScript | Zero erros. |
| ESLint | Zero erros; 28 avisos existentes. |
| Artefato | Worker ESM e manifest aprovados. |
| MySQL real | Roundtrip de cache, trava e limite concorrente aprovados; dados temporários QA removidos. |
| Valores privados em `dist/client` | Nenhuma ocorrência dos valores da `.env`. |
| `git diff --check` | Aprovado. |

Os testes simulados cobrem contratos, cache entre instâncias, busca por consulta, Unicode, deduplicação por IDs, episódios bloqueados, seleção de capítulo, autorização/revogação, assinaturas, qualidades, legendas, 429 e falhas de bootstrap. A regressão inclui os sistemas existentes; não substitui uma nova verificação ao vivo de cada fornecedor externo. O teste de vídeo real e seus limites estão descritos separadamente acima.
