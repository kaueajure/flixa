import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";
import { PROFILE_AVATAR_COLLECTIONS, PROFILE_AVATARS } from "../lib/profile-avatars.ts";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("oferece as 19 franquias e os 81 personagens solicitados", () => {
  assert.equal(PROFILE_AVATAR_COLLECTIONS.length, 19);
  assert.equal(PROFILE_AVATARS.length, 81);
  assert.equal(new Set(PROFILE_AVATARS.map((avatar) => avatar.id)).size, 81);
  assert.deepEqual(
    PROFILE_AVATAR_COLLECTIONS.map((collection) => collection.characters.length),
    [5, 4, 5, 3, 1, 5, 4, 5, 4, 5, 4, 4, 2, 5, 4, 5, 5, 5, 6],
  );
  assert.deepEqual(
    PROFILE_AVATAR_COLLECTIONS[0].characters.map((avatar) => avatar.name),
    ["Homer Simpson", "Marge Simpson", "Bart Simpson", "Lisa Simpson", "Maggie Simpson"],
  );
  assert.deepEqual(
    PROFILE_AVATAR_COLLECTIONS.find((collection) => collection.id === "vingadores")?.characters.map(
      (avatar) => avatar.name,
    ),
    ["Homem de Ferro", "Capitão América", "Thor", "Hulk", "Homem-Aranha"],
  );
});

test("salva somente avatares permitidos e os mostra no perfil e nos amigos", async () => {
  const [auth, account, avatarComponent, styles, page, friends, migration] = await Promise.all([
    read("db/auth.ts"),
    read("app/account-settings-page.tsx"),
    read("app/profile-avatar.tsx"),
    read("app/globals.css"),
    read("app/page.tsx"),
    read("app/friends-view.tsx"),
    read("drizzle/0009_usuario_avatar.sql"),
  ]);

  assert.match(auth, /isValidProfileAvatar\(avatarId\)/);
  assert.match(account, /PROFILE_AVATARS\.length\} personagens organizados em/);
  assert.match(account, /avatar-collection-grid/);
  assert.match(account, /Usar esta foto/);
  assert.doesNotMatch(account, /avatar-collection-tabs/);
  assert.match(avatarComponent, /objectFit: "cover"/);
  assert.match(styles, /\.avatar-collection-grid/);
  assert.match(page, /profile-trigger-avatar/);
  assert.match(friends, /avatarId=\{friend\.avatarId\}/);
  assert.match(migration, /ADD COLUMN `avatar_id` VARCHAR\(80\)/);
});

test("cada personagem usa um PNG local e possui origem registrada", async () => {
  assert.equal(new Set(PROFILE_AVATARS.map((avatar) => avatar.file)).size, 81);

  for (const avatar of PROFILE_AVATARS) {
    assert.match(avatar.file, /^\/assets\/avatars\/[a-z0-9-]+\/[a-z0-9-]+\.png$/);
    const file = await stat(new URL(`public${avatar.file}`, root));
    assert.ok(file.size > 1_000);
  }

  const sources = JSON.parse(await read("public/assets/avatars/sources.json"));
  assert.equal(sources.count, 81);
  assert.equal(sources.avatars.length, 81);
  assert.ok(sources.avatars.every((avatar) => avatar.validated && avatar.sourceUrl && avatar.license));
});
