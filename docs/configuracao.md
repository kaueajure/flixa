# Configuração

A `.env` real contém apenas credenciais e dados privados de conexão. A `.env.example` nunca contém credenciais preenchidas.

| Arquivo | Configurações |
| --- | --- |
| `.env` | MySQL (`MYSQL_HOST`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE`), `TMDB_ACCESS_TOKEN` ou `TMDB_API_KEY`, `SYLN_TOKEN`, `ABLY_API_KEY`; `RESEND_API_KEY` para e-mail e `MINISERIES_REFRESH_SECRET` para cron. |
| `config/app.json` | URL pública, hosts confiáveis, proxy, remetente de e-mail, porta/timeout MySQL e fontes públicas extras dos esportes. |
| `lib/miniseries/settings.ts` | Provedores habilitados, recursos de imagens/reprodução, hosts CDN DramaBox. |

Syln está habilitada no código. Com `SYLN_TOKEN` e IP autorizado no painel Syln, a importação funciona sem referências de validação ou JSON de permissões na `.env`. A fonte confirma disponibilidade e URLs de vídeo somente quando o usuário inicia o episódio. O player e a validação de assinatura/expiração foram preservados.

Importação inicial pelo painel: **Minisséries → Administração → Atualizar catálogo Syln**. Uma página contém até 24 títulos e sua resposta é reutilizada durante 24 horas. Na verificação real, catálogo, detalhes e episódios retornaram HTTP 200; repetir atualização/leitura consumiu zero chamadas externas. Veja [syln-smoke.json](syln-smoke.json). Vídeo real não foi solicitado nesse teste.

DramaBox via Syln está integrado: **Administração → Atualizar DramaBox via Syln**, com filtro de origem na página existente. Foram importados 46 títulos únicos, priorizando português; catálogo, busca, detalhes e episódios retornaram HTTP 200. A reprodução exige referência de autorização por título, guardada na fonte existente no MySQL, sem flags na `.env`. Veja [operação e testes](dramabox-via-syln.md).

DramaBos foi removido (adaptador, credenciais, diagnóstico e chamadas). DramaBox direto continua separado e desativado pelo bootstrap HTTP 403; DramaBox via Syln está preservado.

`npm start` usa `server.cjs`, que carrega `.env` e aplica as configurações públicas do proxy antes de iniciar o Vinext. `server.js` faz o mesmo para a entrada ESM. A porta HTTP usa 3000 por padrão e respeita `PORT` quando fornecida pela hospedagem, sem exigir essa variável na `.env` do projeto. Cookies seguem o protocolo HTTP/HTTPS da requisição.

Após alterar credenciais, reinicie o processo. Após alterar configurações no código em produção, execute novo build e reinicie.


ReelShort direto executa no backend Node, com catálogo, busca, episódios e player existentes. Veja [integração ReelShort](reelshort.md).
