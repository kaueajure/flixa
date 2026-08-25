import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const authSource = readFileSync(new URL("../db/auth.ts", import.meta.url), "utf8");
const librarySource = readFileSync(new URL("../db/library.ts", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const adminSource = readFileSync(new URL("../app/admin/page.tsx", import.meta.url), "utf8");
const settingsSource = readFileSync(new URL("../app/configuracoes/page.tsx", import.meta.url), "utf8");
const hookSource = readFileSync(new URL("../lib/use-live-presence.ts", import.meta.url), "utf8");
const migrationSource = readFileSync(new URL("../drizzle/0012_presenca_real_admin.sql", import.meta.url), "utf8");

test("determina online por páginas visíveis, não por cookies ainda válidos", () => {
  assert.match(authSource, /PRESENCA_JANELA_SEGUNDOS = 75/);
  assert.match(authSource, /\.from\(presencas_usuarios\)/);
  assert.match(authSource, /presencas_usuarios\.ativa[\s\S]*interval 75 second/);
  assert.doesNotMatch(authSource, /sessoes_ativas/);
});

test("mantém uma presença independente por página e encerra ao ocultar ou sair", () => {
  assert.match(hookSource, /crypto\.randomUUID/);
  assert.match(hookSource, /document\.visibilityState !== "visible"/);
  assert.match(hookSource, /navigator\.sendBeacon/);
  assert.match(hookSource, /state: "offline"/);
  assert.match(hookSource, /setInterval\(heartbeat, PRESENCE_HEARTBEAT_MS\)/);
  for (const source of [appSource, adminSource, settingsSource]) {
    assert.match(source, /useLivePresence\(/);
  }
});

test("atualiza o diretório administrativo sem recarregar a página", () => {
  assert.match(adminSource, /const USERS_REFRESH_MS = 15_000/);
  assert.match(adminSource, /setInterval\(refresh, USERS_REFRESH_MS\)/);
  assert.match(adminSource, /carregarUsuarios/);
});

test("consumo usa segundos medidos e ignora players apenas abertos", () => {
  assert.match(authSource, /sum\(\$\{sessoes_visualizacao\.segundos_assistidos\}\)/);
  assert.match(authSource, /estado_reproducao[\s\S]*in \('reproduzindo', 'pausado'\)/);
  assert.match(librarySource, /minutos_assistidos/);
  assert.match(librarySource, /reproducoes_em_andamento/);
  assert.match(adminSource, /tempo medido/i);
  assert.doesNotMatch(adminSource, /reproduções salvas/);
});

test("inclui a tabela e os índices de presença real", () => {
  assert.match(migrationSource, /CREATE TABLE IF NOT EXISTS `presencas_usuarios`/);
  assert.match(migrationSource, /UNIQUE KEY `presencas_usuario_cliente_unico`/);
  assert.match(migrationSource, /KEY `presencas_online_idx`/);
});
