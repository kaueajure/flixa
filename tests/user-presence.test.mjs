import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const authSource = readFileSync(new URL("../db/auth.ts", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const adminSource = readFileSync(new URL("../app/admin/page.tsx", import.meta.url), "utf8");
const migrationSource = readFileSync(new URL("../drizzle/0010_presenca_usuarios.sql", import.meta.url), "utf8");

test("uses recent heartbeats instead of unexpired login cookies for online status", () => {
  assert.match(authSource, /PRESENCA_JANELA_SEGUNDOS = 90/);
  assert.match(authSource, /sessoes\.ultima_atividade_em[\s\S]*interval 90 second/);
  assert.match(authSource, /registrarPresenca/);
  assert.doesNotMatch(authSource, /sessoes_ativas:[^\n]*expira_em[^\n]*current_timestamp\)`/);
});

test("sends presence from the application and admin while they are visible", () => {
  for (const source of [appSource, adminSource]) {
    assert.match(source, /fetch\("\/api\/auth\/presence"/);
    assert.match(source, /document\.visibilityState !== "visible"/);
    assert.match(source, /setInterval\(heartbeat, PRESENCE_HEARTBEAT_MS\)/);
  }
});

test("refreshes the admin user directory without reloading the page", () => {
  assert.match(adminSource, /const USERS_REFRESH_MS = 15_000/);
  assert.match(adminSource, /setInterval\(refresh, USERS_REFRESH_MS\)/);
  assert.match(adminSource, /carregarUsuarios/);
});

test("ships the database column and index needed by presence tracking", () => {
  assert.match(migrationSource, /ADD COLUMN `ultima_atividade_em` DATETIME NOT NULL/);
  assert.match(migrationSource, /ADD KEY `sessoes_presenca_idx`/);
});
