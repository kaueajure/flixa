import { and, desc, eq, gt, inArray, isNull, like, ne, or, sql } from "drizzle-orm";
import { normalizarUsername, validarUsername } from "./auth";
import { withDb, type FlixaDb } from "./index";
import { amizades, progresso_reproducao, recomendacoes_amigos, usuarios } from "./schema";

function agoraSql() {
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}

function orderedPair(left: number, right: number) {
  return left < right ? [left, right] as const : [right, left] as const;
}

function publicProfile(row: { id: number; nome: string; username: string | null; avatar_id?: string | null }) {
  return { id: row.id, nome: row.nome, username: row.username || "", avatarId: row.avatar_id || null };
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
      ? await db.select({ id: usuarios.id, nome: usuarios.nome, username: usuarios.username, avatar_id: usuarios.avatar_id })
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
    const unreadRows = acceptedIds.length
      ? await db.select({
        remetente_id: recomendacoes_amigos.remetente_id,
        total: sql<number>`count(*)`,
      }).from(recomendacoes_amigos)
        .where(and(
          eq(recomendacoes_amigos.destinatario_id, usuarioId),
          inArray(recomendacoes_amigos.remetente_id, acceptedIds),
          isNull(recomendacoes_amigos.visualizado_em),
        ))
        .groupBy(recomendacoes_amigos.remetente_id)
      : [];
    const unreadByUser = new Map(unreadRows.map((row) => [row.remetente_id, Number(row.total || 0)]));

    const amigos: Array<ReturnType<typeof publicProfile> & { activity: unknown; unreadRecommendations: number }> = [];
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
          unreadRecommendations: unreadByUser.get(otherId) || 0,
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
    const rows = await db.select({ id: usuarios.id, nome: usuarios.nome, username: usuarios.username, avatar_id: usuarios.avatar_id })
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

async function amizadeAceita(db: FlixaDb, usuarioId: number, amigoId: number) {
  const [usuarioA, usuarioB] = orderedPair(usuarioId, amigoId);
  const rows = await db.select({ id: amizades.id }).from(amizades).where(and(
    eq(amizades.usuario_a_id, usuarioA),
    eq(amizades.usuario_b_id, usuarioB),
    eq(amizades.status, "aceita"),
  )).limit(1);
  return Boolean(rows[0]);
}

export async function listarRecomendacoes(usuarioId: number, amigoId: number) {
  return withDb(async (db) => {
    if (!(await amizadeAceita(db, usuarioId, amigoId))) {
      return { erro: "Amizade não encontrada.", recomendacoes: [] as unknown[] };
    }
    const rows = await db.select().from(recomendacoes_amigos).where(or(
      and(eq(recomendacoes_amigos.remetente_id, usuarioId), eq(recomendacoes_amigos.destinatario_id, amigoId)),
      and(eq(recomendacoes_amigos.remetente_id, amigoId), eq(recomendacoes_amigos.destinatario_id, usuarioId)),
    )).orderBy(desc(recomendacoes_amigos.enviado_em)).limit(100);

    await db.update(recomendacoes_amigos)
      .set({ visualizado_em: agoraSql() })
      .where(and(
        eq(recomendacoes_amigos.remetente_id, amigoId),
        eq(recomendacoes_amigos.destinatario_id, usuarioId),
        isNull(recomendacoes_amigos.visualizado_em),
      ));

    return {
      erro: null as string | null,
      recomendacoes: rows.reverse().map((row) => ({
        id: row.id,
        mine: row.remetente_id === usuarioId,
        titleKey: row.chave_titulo,
        tmdb_id: row.tmdb_id,
        imdb_id: row.imdb_id,
        kind: row.tipo === "serie" ? "tv" as const : "movie" as const,
        title: row.titulo,
        poster: row.poster || "",
        backdrop: row.backdrop || "",
        year: row.ano,
        sentAt: row.enviado_em,
        seen: row.remetente_id === usuarioId ? Boolean(row.visualizado_em) : true,
      })),
    };
  });
}

type RecomendacaoInput = {
  tmdb_id?: string;
  kind?: string;
  title?: string;
  poster?: string;
  backdrop?: string;
  year?: number;
};

function imagemTmdb(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" && url.hostname === "image.tmdb.org" ? url.toString() : null;
  } catch {
    return null;
  }
}

export async function enviarRecomendacao(usuarioId: number, amigoId: number, input: RecomendacaoInput) {
  const tmdbId = String(input.tmdb_id || "").trim();
  const kind = input.kind === "tv" ? "tv" : input.kind === "movie" ? "movie" : null;
  const title = String(input.title || "").trim().replace(/\s+/g, " ").slice(0, 255);
  const year = Number(input.year);
  if (!/^\d{1,12}$/.test(tmdbId) || !kind || title.length < 1) {
    return { erro: "Título inválido." };
  }

  return withDb(async (db) => {
    if (!(await amizadeAceita(db, usuarioId, amigoId))) return { erro: "Você só pode enviar títulos para amigos." };
    const since = new Date(Date.now() - 60_000).toISOString().slice(0, 19).replace("T", " ");
    const recent = await db.select({ total: sql<number>`count(*)` }).from(recomendacoes_amigos).where(and(
      eq(recomendacoes_amigos.remetente_id, usuarioId),
      gt(recomendacoes_amigos.enviado_em, since),
    ));
    if (Number(recent[0]?.total || 0) >= 12) return { erro: "Você enviou muitos títulos agora. Aguarde um minuto." };

    await db.insert(recomendacoes_amigos).values({
      remetente_id: usuarioId,
      destinatario_id: amigoId,
      chave_titulo: `${kind}:${tmdbId}`,
      tmdb_id: tmdbId,
      tipo: kind === "tv" ? "serie" : "filme",
      titulo: title,
      poster: imagemTmdb(input.poster),
      backdrop: imagemTmdb(input.backdrop),
      ano: Number.isInteger(year) && year >= 1888 && year <= 2200 ? year : null,
      enviado_em: agoraSql(),
    });
    return { erro: null as string | null };
  });
}
