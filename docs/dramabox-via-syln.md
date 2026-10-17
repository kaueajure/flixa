# DramaBox via Syln

Integração validada em 17/10/2026 usando o token privado já configurado. Reutiliza as páginas, o player vertical, os adaptadores e as tabelas MySQL existentes. DramaBox é a plataforma de origem; Syln é o fornecedor técnico. A integração direta `@zhadev/dramabox` continua separada e desativada pelo bootstrap HTTP 403; esse acesso não foi corrigido pela Syln. DramaBos não foi consultado.

## Resultados reais

Evidência sem credenciais ou URLs assinadas: [syln-dramabox-smoke.json](syln-dramabox-smoke.json). As respostas não são mocks.

| Operação efetivamente testada | Resultado |
| --- | --- |
| `GET /v1/platforms` | HTTP 200; `dramabox` habilitado; 15.221 títulos informados pelo fornecedor, sem varredura do catálogo inteiro. |
| `GET /v1/languages?platform=dramabox` | HTTP 200; 16 idiomas, incluindo `pt`. |
| `GET /v1/catalog?platform=dramabox&content_type=short_drama&has_media=true&page=1&limit=24` | HTTP 200; 24 resultados. |
| Mesmo catálogo com `lang=pt` | HTTP 200; 24 resultados. As duas páginas produziram 46 títulos únicos persistidos, priorizando português sem excluir os demais idiomas. |
| `GET /v1/search?q=...&platform=dramabox` | HTTP 200; pesquisa pelo título retornou o ID conhecido. |
| `GET /v1/titles/dramabox:42000010189` | HTTP 200; título em português, sinopse, capa e contagem de 60 episódios. |
| `GET /v1/titles/dramabox:42000010189/episodes` | HTTP 200; 60 episódios, todos com mídia indicada; resoluções anunciadas 540/720/1080. Isso não comprova acesso a cada resolução pelo plano. |
| `GET /v1/titles/{id}/play/{ep}` | Não solicitado: falta identificar o título específico autorizado e a referência da autorização. Player real não testado. |

Foram sete chamadas HTTP de metadados: três de descoberta e quatro adicionais na validação integrada. Respostas reais de descoberta foram reutilizadas no cache normalizado. Repetir atualização, catálogo, busca e episódios gerou **zero chamadas adicionais**.

## Uso

Na seção existente: **Administração → Atualizar DramaBox via Syln**. O filtro **DramaBox via Syln** consulta os títulos locais. A busca mantém debounce de 600 ms e usa primeiro o MySQL. Só consulta a busca Syln quando necessário, sem usar DramaBos ou o SDK direto.

A configuração obrigatória continua sendo `SYLN_TOKEN`, IP de saída autorizado na Syln e as credenciais MySQL existentes. Não há novas flags na `.env`. Reinicie ao alterar credenciais; execute novo build e reinicie para publicar mudanças de código.

```bash
npm run syln:dramabox:smoke
# Atualização por cron: exige MINISERIES_REFRESH_SECRET e servidor publicado atualizado.
npm run miniseries:refresh -- --provider=syln --platform=dramabox --page=1
```

O painel administrativo usa a sessão existente e dispensa segredo de cron. O smoke real impede chamadas a `/play` e a outros fornecedores, reutiliza o cache persistente e registra apenas campos normalizados e diagnósticos sem tokens.

## Cache, identidade e reprodução

Catálogo, descoberta, buscas e episódios têm cache MySQL de 24 horas; detalhes, sete dias. Uma atualização consulta no máximo uma página geral e uma em português quando esse idioma estiver realmente disponível. Não há coleta automática de todo o catálogo. Consultas simultâneas, concorrência, 429, cooldown e orçamento passam pelo transporte central existente.

IDs Syln completos são preservados. `platform:dramabox` associa o ID externo ao identificador interno estável. A deduplicação exige identificadores compartilhados ou as evidências fortes existentes, sem unir apenas por nomes parecidos. Metadados locais/MicroDramaList são reaproveitados; uma referência Syln conhecida não dispara outra busca de enriquecimento. Português explícito tem preferência sem presumir o idioma de áudio.

O token comprova acesso técnico, não direitos de distribuição. DramaBox via Syln exige autorização por título/fonte antes de habilitar Play. A referência fica no JSON existente da fonte no MySQL, sem nova tabela ou variável de ambiente e sem exposição ao navegador. O administrador pode registrar ou revogar via `POST /api/admin/miniseries`:

- `action: "authorizePlayback"`, `id` interno, `source` da fonte existente, `reference` da autorização e `expiresAt` opcional; a data de registro é definida pelo servidor.
- `action: "revokePlayback"`, mesmos `id` e `source`.

Essas ações exigem sessão administrativa; o segredo de cron não as autoriza. Nenhuma autorização foi cadastrada automaticamente. A declaração de que existe um título autorizado ainda precisa ser acompanhada do ID completo e da referência para testar esse título.

Episódios podem ser consultados sem habilitar vídeo. A seleção preserva o número real `ep` e as resoluções retornadas. URLs são solicitadas apenas após Play autorizado, com validação de episódio, host, formato e expiração, sem persistência de links temporários. Enquanto não autorizado, permanece o acesso à plataforma original. Não houve teste real de vídeo, CORS ou expiração nesta entrega.

## Verificação

A suíte automatizada cobre contratos reais com respostas MOCK identificadas, filtros/paginação, cache persistente, deduplicação entre fontes, preferência de idioma, concorrência, 429, bloqueio de reprodução sem autorização/expirada e revogação. Testes simulados de player não comprovam reprodução real. Os resultados finais do projeto estão registrados na entrega; os relatórios antigos das integrações diretas permanecem históricos.

| Verificação final | Resultado |
| --- | --- |
| Build de produção | Aprovado; aviso conhecido de classificação estática de rotas do Vinext. |
| Suíte completa | 122 testes aprovados, zero falhas/ignorados. |
| TypeScript | Zero erros. |
| ESLint | Zero erros, 28 avisos existentes. |
| Artefato de produção | Worker ESM e manifest aprovados. |
| MySQL real | Cache, trava, cinco reservas entre doze concorrentes com limite cinco e leitura do catálogo aprovados; registros QA removidos. |
| Credenciais no cliente | Nenhum valor privado da `.env` encontrado em `dist/client`. |
| `git diff --check` | Aprovado. |

A suíte cobre também os fluxos existentes de filmes, séries e demais recursos. Não representa uma nova validação ao vivo de cada fornecedor externo. Nenhum teste real de vídeo foi executado sem o título e a referência de distribuição necessários.
