import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const pageSource = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");

test("keeps the desktop navigation in a coherent centered order", () => {
  const headerStart = pageSource.indexOf('<nav className="nav-links"');
  const headerEnd = pageSource.indexOf("</nav>", headerStart);
  const header = pageSource.slice(headerStart, headerEnd);
  const orderedRoutes = [
    "#home",
    "#filmes",
    "#series",
    "#surpreenda-me",
    "#esportes",
    "#assistir-em-grupo",
  ];
  let cursor = -1;
  for (const route of orderedRoutes) {
    const next = header.indexOf(route);
    assert.ok(next > cursor, `${route} should appear in navigation order`);
    cursor = next;
  }

  const profileStart = pageSource.indexOf('<div className="profile-dropdown"');
  const profileEnd = pageSource.indexOf("</header>", profileStart);
  const profile = pageSource.slice(profileStart, profileEnd);
  assert.match(profile, /minha-lista/);
  assert.match(profile, /amigos/);
  assert.match(profile, /assistir-em-grupo/);
});

test("keeps the mobile navigation focused on five primary destinations", () => {
  const navStart = pageSource.indexOf('<nav className="mobile-nav"');
  const navEnd = pageSource.indexOf("</nav>", navStart);
  const nav = pageSource.slice(navStart, navEnd);
  for (const route of ["#home", "#filmes", "#surpreenda-me", "#esportes"]) {
    assert.match(nav, new RegExp(route));
  }
  assert.match(nav, /mobile-profile-trigger/);
});

test("makes the server picker searchable and exposes the selected server", () => {
  assert.match(pageSource, /placeholder="Buscar servidor"/);
  assert.match(pageSource, /Reproduzindo agora/);
  assert.match(pageSource, /player-server-active-label">Em uso/);
});
