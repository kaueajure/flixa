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
    "#minha-lista",
    "#surpreenda-me",
    "#esportes",
    "#amigos",
    "#assistir-em-grupo",
  ];
  let cursor = -1;
  for (const route of orderedRoutes) {
    const next = header.indexOf(route);
    assert.ok(next > cursor, `${route} should appear in navigation order`);
    cursor = next;
  }
});

test("makes the server picker searchable and exposes the selected server", () => {
  assert.match(pageSource, /placeholder="Buscar servidor"/);
  assert.match(pageSource, /Reproduzindo agora/);
  assert.match(pageSource, /player-server-active-label">Em uso/);
});
