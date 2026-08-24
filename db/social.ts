import { and, desc, eq, gt, inArray, like, ne, or } from "drizzle-orm";
import { normalizarUsername, validarUsername } from "./auth";
import { withDb } from "./index";
import { amizades, progresso_reproducao, usuarios } from "./schema";

function agoraSql() {
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}

function orderedPair(left: number, right: number) {
  return left < right ? [left, right] as const : [right, left] as const;
}

function publicProfile(row: { id: number; nome: string; username: string | null }) {
  return { id: row.id, nome: row.nome, username: row.username || "" };
}

export async function definirUsername(usuarioId: number, rawUsername: string) {
  const validation = validarUsername(rawUsername);
  if (validation.erro) return { erro: validation.erro, username: null as string | null };

  return withDb(async (db) => {
    const currentRows = await db
      .select({ username: usuarios.username })
      .from(usuarios)
      .where(eq(usuarios.id, usuarioId))
      .limit(1);
    if (!currentRows[0]) return { erro: "Usuário não encontrado.", username: null as string | null };
    if (currentRows[0].username) return { erro: "Seu username já foi definido.", username: currentRows[0].username };

    const used = await db
      .select({ id: usuarios.id })
      .from(usuarios)
      .where(eq(usuarios.username, validation.username))
      .limit(1);
    if (used[0]) return { erro: "Este username já está em uso.", username: null as string | null };

    try {
      await db.update(usuarios).set({
        username: validation.username,
        atualizado_em: agoraSql(),
      }).where(eq(usuarios.id, usuarioId));
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
      if (code === "ER_DUP_ENTRY") return { erro: "Este username acabou de ser escolhido por outra pessoa.", username: null as string | null };
      throw error;
    }
    return { erro: null as string | null, username: validation.username };
  });
}

export async function listarSocial(usuarioId: number) {
  return withDb(async (db) => {
    const relations = await db.select().from(amizades).where(
      or(eq(amizades.usuario_a_id, usuarioId), eq(amizades.usuario_b_id, usuarioId)),
    );
    const otherIds = [...new Set(relations.map((relation) =>
      relation.usuario_a_id === usuarioId ? relation.usuario_b_id : relation.usuario_a_id,
    ))];
    const profiles = otherIds.length
      ? await db.select({ id: usuarios.id, nome: usuarios.nome, username: usuarios.username })
        .from(usuarios)
        .where(inArray(usuarios.id, otherIds))
      : [];
    const profilesById = new Map(profiles.map((profile) => [profile.id, profile]));
    const acceptedIds = relations
      .filter((relation) => relation.status === "aceita")
      .map((relation) => relation.usuario_a_id === usuarioId ? relation.usuario_b_id : relation.usuario_a_id);
    const activityRows = acceptedIds.length
      ? await db.select({
        usuario_id: progresso_reproducao.usuario_id,
        chave_titulo: progresso_reproducao.chave_titulo,
        tmdb_id: progresso_reproducao.tmdb_id,
        tipo: progresso_reproducao.tipo,
        titulo: progresso_reproducao.titulo,
        poster: progresso_reproducao.poster,
        progresso: progresso_reproducao.progresso,
        temporada: progresso_reproducao.temporada,
        episodio: progresso_reproducao.episodio,
        atualizado_em: progresso_reproducao.atualizado_em,
      }).from(progresso_reproducao)
        .where(and(inArray(progresso_reproducao.usuario_id, acceptedIds), gt(progresso_reproducao.progresso, "0.00")))
        .orderBy(desc(progresso_reproducao.atualizado_em))
        .limit(Math.min(100, acceptedIds.length * 5))
      : [];
    const activityByUser = new Map<number, (typeof activityRows)[number]>();
    for (const activity of activityRows) {
      if (!activityByUser.has(activity.usuario_id)) activityByUser.set(activity.usuario_id, activity);
    }

    const amigos: Array<ReturnType<typeof publicProfile> & { activity: unknown }> = [];
    const solicitacoes: Array<ReturnType<typeof publicProfile>> = [];
    const enviadas: Array<ReturnType<typeof publicProfile>> = [];
    for (const relation of relations) {
      const otherId = relation.usuario_a_id === usuarioId ? relation.usuario_b_id : relation.usuario_a_id;
      const profile = profilesById.get(otherId);
      if (!profile?.username) continue;
      if (relation.status === "aceita") {
        const activity = activityByUser.get(otherId);
        amigos.push({
          ...publicProfile(profile),
          activity: activity ? {
            id: activity.chave_titulo,
            tmdb_id: activity.tmdb_id,
            kind: activity.tipo === "serie" ? "tv" : "movie",
            title: activity.titulo,
            poster: activity.poster || "",
            progress: Number(activity.progresso),
            season: activity.temporada,
            episode: activity.episodio,
            updatedAt: activity.atualizado_em,
          } : null,
        });
      } else if (relation.solicitante_id === usuarioId) {
        enviadas.push(publicProfile(profile));
      } else {
        solicitacoes.push(publicProfile(profile));
      }
    }
    return { amigos, solicitacoes, enviadas };
  });
}

export async function buscarUsuarios(usuarioId: number, rawQuery: string) {
  const query = normalizarUsername(rawQuery).replace(/[^a-z0-9._]/g, "").slice(0, 20);
  if (query.length < 2) return [];
  return withDb(async (db) => {
    const rows = await db.select({ id: usuarios.id, nome: usuarios.nome, username: usuarios.username })
      .from(usuarios)
      .where(and(ne(usuarios.id, usuarioId), like(usuarios.username, `${query}%`)))
      .limit(12);
    const ids = rows.map((row) => row.id);
    const relations = ids.length
      ? await db.select().from(amizades).where(and(
        or(eq(amizades.usuario_a_id, usuarioId), eq(amizades.usuario_b_id, usuarioId)),
        or(inArray(amizades.usuario_a_id, ids), inArray(amizades.usuario_b_id, ids)),
      ))
      : [];
    return rows.filter((row) => row.username).map((row) => {
      const relation = relations.find((item) => item.usuario_a_id === row.id || item.usuario_b_id === row.id);
      const relationStatus = relation?.status === "aceita"
        ? "amigo"
        : relation?.solicitante_id === usuarioId
          ? "enviada"
          : relation
            ? "recebida"
            : "nenhuma";
      return { ...publicProfile(row), relation: relationStatus };
    });
  });
}

export async function enviarSolicitacao(usuarioId: number, targetUsername: string) {
  const normalized = normalizarUsername(targetUsername);
  return withDb(async (db) => {
    const targets = await db.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.username, normalized)).limit(1);
    const target = targets[0];
    if (!target) return { erro: "Usuário não encontrado." };
    if (target.id === usuarioId) return { erro: "Você não pode adicionar a si mesmo." };
    const [usuarioA, usuarioB] = orderedPair(usuarioId, target.id);
    const existingRows = await db.select().from(amizades).where(and(
      eq(amizades.usuario_a_id, usuarioA),
      eq(amizades.usuario_b_id, usuarioB),
    )).limit(1);
    const existing = existingRows[0];
    if (existing?.status === "aceita") return { erro: "Vocês já são amigos." };
    if (existing?.solicitante_id === usuarioId) return { erro: "A solicitação já foi enviada." };
    if (existing) {
      await db.update(amizades).set({ status: "aceita", atualizado_em: agoraSql() }).where(eq(amizades.id, existing.id));
      return { erro: null as string | null, accepted: true };
    }
    await db.insert(amizades).values({
      usuario_a_id: usuarioA,
      usuario_b_id: usuarioB,
      solicitante_id: usuarioId,
      status: "pendente",
      criado_em: agoraSql(),
      atualizado_em: agoraSql(),
    });
    return { erro: null as string | null, accepted: false };
  });
}

export async function responderSolicitacao(usuarioId: number, targetId: number, aceitar: boolean) {
  const [usuarioA, usuarioB] = orderedPair(usuarioId, targetId);
  return withDb(async (db) => {
    const rows = await db.select().from(amizades).where(and(
      eq(amizades.usuario_a_id, usuarioA),
      eq(amizades.usuario_b_id, usuarioB),
    )).limit(1);
    const relation = rows[0];
    if (!relation || relation.status !== "pendente" || relation.solicitante_id === usuarioId) {
      return { erro: "Solicitação não encontrada." };
    }
    if (!aceitar) {
      await db.delete(amizades).where(eq(amizades.id, relation.id));
      return { erro: null as string | null };
    }
    await db.update(amizades).set({ status: "aceita", atualizado_em: agoraSql() }).where(eq(amizades.id, relation.id));
    return { erro: null as string | null };
  });
}

export async function removerRelacao(usuarioId: number, targetId: number) {
  const [usuarioA, usuarioB] = orderedPair(usuarioId, targetId);
  return withDb(async (db) => {
    await db.delete(amizades).where(and(
      eq(amizades.usuario_a_id, usuarioA),
      eq(amizades.usuario_b_id, usuarioB),
    ));
    return { erro: null as string | null };
  });
}
