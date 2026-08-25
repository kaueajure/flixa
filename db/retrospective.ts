import { and, eq, gte, inArray, lt, or } from "drizzle-orm";
import { withDb } from "./index";
import { amizades, descobertas_roleta, sessoes_visualizacao, usuarios } from "./schema";

function sqlDate(date: Date) { return date.toISOString().slice(0, 19).replace("T", " "); }
function genres(value: unknown) { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []; }
function genreProfile(rows: Array<{ generos: unknown; seconds: number }>) {
  const profile = new Map<string, number>();
  for (const row of rows) for (const genre of genres(row.generos)) profile.set(genre, (profile.get(genre) || 0) + row.seconds);
  return profile;
}
function compatibility(left: Map<string, number>, right: Map<string, number>) {
  const keys = new Set([...left.keys(), ...right.keys()]);
  let overlap = 0; let total = 0;
  for (const key of keys) { overlap += Math.min(left.get(key) || 0, right.get(key) || 0); total += Math.max(left.get(key) || 0, right.get(key) || 0); }
  return total ? Math.round(overlap / total * 100) : 0;
}

export async function obterRetrospectiva(usuarioId: number, mode: "month" | "year", reference = new Date()) {
  const start = mode === "year" ? new Date(Date.UTC(reference.getUTCFullYear(), 0, 1)) : new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), 1));
  const end = mode === "year" ? new Date(Date.UTC(reference.getUTCFullYear() + 1, 0, 1)) : new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth() + 1, 1));
  return withDb(async (db) => {
    const rows = await db.select({
      userId: sessoes_visualizacao.usuario_id,
      titleKey: sessoes_visualizacao.chave_titulo,
      title: sessoes_visualizacao.titulo,
      year: sessoes_visualizacao.ano,
      genres: sessoes_visualizacao.generos_json,
      seconds: sessoes_visualizacao.segundos_assistidos,
      source: sessoes_visualizacao.fonte_progresso,
      completed: sessoes_visualizacao.concluido,
      startedAt: sessoes_visualizacao.iniciado_em,
    }).from(sessoes_visualizacao).where(and(
      eq(sessoes_visualizacao.usuario_id, usuarioId),
      gte(sessoes_visualizacao.iniciado_em, sqlDate(start)),
      lt(sessoes_visualizacao.iniciado_em, sqlDate(end)),
    ));
    const own = rows.map((row) => ({ generos: row.genres, seconds: Number(row.seconds || 0) }));
    const profile = genreProfile(own);
    const favoriteGenre = [...profile.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    const decadeMap = new Map<number, number>();
    const dayMap = new Map<string, number>();
    for (const row of rows) {
      if (row.year) { const decade = Math.floor(row.year / 10) * 10; decadeMap.set(decade, (decadeMap.get(decade) || 0) + Number(row.seconds)); }
      const day = String(row.startedAt).slice(0, 10); dayMap.set(day, (dayMap.get(day) || 0) + Number(row.seconds));
    }
    const favoriteDecade = [...decadeMap.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    const marathon = [...dayMap.entries()].sort((a, b) => b[1] - a[1])[0] || null;

    const relations = await db.select().from(amizades).where(and(eq(amizades.status, "aceita"), or(eq(amizades.usuario_a_id, usuarioId), eq(amizades.usuario_b_id, usuarioId))));
    const friendIds = relations.map((item) => item.usuario_a_id === usuarioId ? item.usuario_b_id : item.usuario_a_id);
    let bestFriend: { id: number; name: string; username: string; compatibility: number } | null = null;
    if (friendIds.length && profile.size) {
      const [friends, friendSessions] = await Promise.all([
        db.select({ id: usuarios.id, name: usuarios.nome, username: usuarios.username }).from(usuarios).where(inArray(usuarios.id, friendIds)),
        db.select({ userId: sessoes_visualizacao.usuario_id, generos: sessoes_visualizacao.generos_json, seconds: sessoes_visualizacao.segundos_assistidos })
          .from(sessoes_visualizacao).where(and(inArray(sessoes_visualizacao.usuario_id, friendIds), gte(sessoes_visualizacao.iniciado_em, sqlDate(start)), lt(sessoes_visualizacao.iniciado_em, sqlDate(end)))),
      ]);
      for (const friend of friends) {
        const score = compatibility(profile, genreProfile(friendSessions.filter((item) => item.userId === friend.id).map((item) => ({ generos: item.generos, seconds: Number(item.seconds) }))));
        if (!bestFriend || score > bestFriend.compatibility) bestFriend = { id: friend.id, name: friend.name, username: friend.username || "", compatibility: score };
      }
    }
    const discoveries = await db.select().from(descobertas_roleta).where(and(eq(descobertas_roleta.usuario_id, usuarioId), gte(descobertas_roleta.escolhido_em, sqlDate(start)), lt(descobertas_roleta.escolhido_em, sqlDate(end))));
    const totalSeconds = rows.reduce((sum, row) => sum + Number(row.seconds || 0), 0);
    const realSeconds = rows.filter((row) => row.source === "real").reduce((sum, row) => sum + Number(row.seconds || 0), 0);
    const completedKeys = new Set(rows.filter((row) => Number(row.completed) === 1).map((row) => row.titleKey));
    const bestDiscovery = discoveries.sort((a, b) => {
      const completedDifference = Number(completedKeys.has(b.chave_titulo)) - Number(completedKeys.has(a.chave_titulo));
      return completedDifference || String(b.escolhido_em).localeCompare(String(a.escolhido_em));
    })[0];
    return {
      mode,
      periodLabel: mode === "year" ? String(start.getUTCFullYear()) : new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }).format(start),
      minutes: Math.round(totalSeconds / 60),
      realMinutes: Math.round(realSeconds / 60),
      completedTitles: completedKeys.size,
      favoriteGenre,
      favoriteDecade: favoriteDecade ? `Anos ${favoriteDecade}` : null,
      marathon: marathon ? { date: marathon[0], minutes: Math.round(marathon[1] / 60) } : null,
      bestFriend,
      rouletteDiscovery: bestDiscovery ? { title: bestDiscovery.titulo, poster: bestDiscovery.poster, genre: bestDiscovery.genero } : null,
      hasEstimatedData: totalSeconds > realSeconds,
    };
  });
}

export async function registrarDescobertaRoleta(usuarioId: number, movie: { key: string; title: string; poster?: string; genre?: string }) {
  await withDb((db) => db.insert(descobertas_roleta).values({ usuario_id: usuarioId, chave_titulo: movie.key.slice(0, 64), titulo: movie.title.slice(0, 255), poster: movie.poster?.slice(0, 2048) || null, genero: movie.genre?.slice(0, 80) || null, escolhido_em: sqlDate(new Date()) }));
}
