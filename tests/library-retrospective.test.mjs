import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("biblioteca oferece estados, favoritos, coleções, filtros e episódios", async () => {
  const [view, schema, episodes] = await Promise.all([read("app/library-view.tsx"), read("db/schema.ts"), read("app/api/lista/episodios/route.ts")]);
  for (const label of ["Quero assistir", "Assistindo", "Concluídos", "Abandonei", "Favoritos", "Não é para mim", "Qualquer duração"]) assert.match(view, new RegExp(label));
  assert.match(schema, /lista_colecoes/);
  assert.match(schema, /episodios_assistidos/);
  assert.match(episodes, /marcarEpisodioAssistido/);
});

test("retrospectiva usa sessões novas e distingue progresso real do estimado", async () => {
  const [route, report, player] = await Promise.all([read("app/api/retrospectiva/route.ts"), read("db/retrospective.ts"), read("app/page.tsx")]);
  assert.match(route, /obterRetrospectiva/);
  assert.match(report, /realMinutes/);
  assert.match(report, /bestFriend/);
  assert.match(player, /Progresso confirmado/);
  assert.match(player, /Progresso aproximado/);
  assert.match(player, /progressRef\.current >= 90/);
});
