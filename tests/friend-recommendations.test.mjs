import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("o chat de amigos aceita somente títulos, sem mensagens livres", async () => {
  const [view, migration] = await Promise.all([
    read("app/friends-view.tsx"),
    read("drizzle/0008_recomendacoes_amigos.sql"),
  ]);

  assert.match(view, /Aqui só entram filmes e séries — sem mensagens de texto/);
  assert.match(view, /id="recommendation-search"/);
  assert.match(view, /api\/amigos\/recomendacoes/);
  assert.doesNotMatch(migration, /\b(mensagem|conteudo|texto)\b/i);
});

test("o servidor confirma amizade e resolve o título na TMDB", async () => {
  const [route, social] = await Promise.all([
    read("app/api/amigos/recomendacoes/route.ts"),
    read("db/social.ts"),
  ]);

  assert.match(route, /getTmdbDetails\(tmdbId, kind\)/);
  assert.match(route, /requireUsuario\(request\)/);
  assert.match(social, /amizadeAceita\(db, usuarioId, amigoId\)/);
  assert.match(social, /Você só pode enviar títulos para amigos/);
  assert.match(social, /visualizado_em/);
});
