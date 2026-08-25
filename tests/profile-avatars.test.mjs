import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PROFILE_AVATAR_COLLECTIONS, PROFILE_AVATARS } from "../lib/profile-avatars.ts";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("oferece 25 desenhos e 125 personagens únicos", () => {
  assert.equal(PROFILE_AVATAR_COLLECTIONS.length, 25);
  assert.equal(PROFILE_AVATARS.length, 125);
  assert.equal(new Set(PROFILE_AVATARS.map((avatar) => avatar.id)).size, 125);
  assert.ok(PROFILE_AVATAR_COLLECTIONS.every((collection) => collection.characters.length === 5));
  assert.deepEqual(
    PROFILE_AVATAR_COLLECTIONS[0].characters.map((avatar) => avatar.name),
    ["Bart Simpson", "Lisa Simpson", "Homer Simpson", "Marge Simpson", "Maggie Simpson"],
  );
});

test("salva somente avatares permitidos e os mostra no perfil e nos amigos", async () => {
  const [auth, account, avatarComponent, styles, page, friends, migration] = await Promise.all([
    read("db/auth.ts"),
    read("app/account-settings-modal.tsx"),
    read("app/profile-avatar.tsx"),
    read("app/globals.css"),
    read("app/page.tsx"),
    read("app/friends-view.tsx"),
    read("drizzle/0009_usuario_avatar.sql"),
  ]);

  assert.match(auth, /isValidProfileAvatar\(avatarId\)/);
  assert.match(account, /125 personagens organizados em 25 coleções/);
  assert.match(account, /avatar-collection-grid/);
  assert.match(account, /Usar esta foto/);
  assert.doesNotMatch(account, /avatar-collection-tabs/);
  assert.match(avatarComponent, /objectFit: "cover"/);
  assert.match(styles, /\.avatar-collection-grid/);
  assert.match(page, /profile-trigger-avatar/);
  assert.match(friends, /avatarId=\{friend\.avatarId\}/);
  assert.match(migration, /ADD COLUMN `avatar_id` VARCHAR\(80\)/);
});

test("as fotos coletivas têm recortes distintos para cada personagem", () => {
  for (const collectionId of ["turma-da-monica", "irmao-do-jorel"]) {
    const collection = PROFILE_AVATAR_COLLECTIONS.find((item) => item.id === collectionId);
    assert.ok(collection);
    const signatures = collection.characters.map((avatar) => `${avatar.sourceUrl || avatar.page}|${avatar.backgroundSize || "cover"}|${avatar.objectPosition || "center"}`);
    assert.equal(new Set(signatures).size, 5);
  }
});
