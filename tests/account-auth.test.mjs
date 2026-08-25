import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("configurações permitem nome e e-mail, mas mantêm o username imutável", async () => {
  const [modal, api, auth] = await Promise.all([
    read("app/account-settings-modal.tsx"),
    read("app/api/auth/account/route.ts"),
    read("db/auth.ts"),
  ]);

  assert.match(modal, /username é permanente/i);
  assert.match(modal, /disabled readOnly/);
  assert.doesNotMatch(api, /body\.username/);
  assert.match(auth, /senha atual para alterar o e-mail/i);
});

test("recuperação armazena apenas hash, expira e é de uso único", async () => {
  const [auth, migration, route] = await Promise.all([
    read("db/auth.ts"),
    read("drizzle/0007_recuperacao_senha.sql"),
    read("app/api/auth/password-recovery/route.ts"),
  ]);

  assert.match(auth, /createHash\("sha256"\)\.update\(token\)/);
  assert.match(auth, /30 \* 60_000/);
  assert.match(auth, /isNull\(recuperacoes_senha\.usado_em\)/);
  assert.match(auth, /delete\(sessoes\).*usuario_id/s);
  assert.match(migration, /UNIQUE KEY `recuperacoes_senha_token_unico`/);
  assert.match(route, /Se esse e-mail estiver cadastrado/);
});

test("tela de login oferece solicitação e redefinição de senha", async () => {
  const login = await read("app/login-form.tsx");
  const page = await read("app/login/page.tsx");

  assert.match(login, /Esqueci minha senha/);
  assert.match(login, /api\/auth\/password-recovery/);
  assert.match(login, /searchParams\.get\("reset"\)/);
  assert.match(page, /referrer: "no-referrer"/);
});
