import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { withDb } from "./index";
import { episodios_assistidos, historico_assistidos, lista_colecao_itens, lista_colecoes, lista_titulos, presencas_usuarios, progresso_reproducao, sessoes_visualizacao, usuarios } from "./schema";

export type TituloPayload = {
  id: string;
  source?: string;
  kind?: "movie" | "tv";
  list?: string;
  imdb_id?: string;
  tmdb_id?: string;
  title: string;
  description?: string;
  poster: string;
  backdrop: string;
  duration?: string;
  year?: number;
  genres?: string[];
  rating?: string;
  director?: string;
  cast?: string[];
  trailer?: string;
  progress?: number;
  season?: number;
  episode?: number;
  positionSeconds?: number;
  available?: boolean;
  provider_available?: boolean;
  playback_locale?: "pt-BR";
  is_brazilian?: boolean;
  libraryState?: "quero_assistir" | "assistindo" | "concluido" | "abandonado";
  favorite?: boolean;
  notForMe?: boolean;
  collections?: Array<{ id: number; name: string }>;
  playbackState?: "aberto" | "reproduzindo" | "pausado" | "concluido";
  progressSource?: "real" | "estimado";
  durationSeconds?: number;
  addedAt?: string;
  updatedAt?: string;
};

function agoraSql() {
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}

export function chaveTitulo(movie: TituloPayload) {
  if (movie.kind === "tv") return `tv:${movie.tmdb_id || movie.id}`;
  return String(movie.tmdb_id || movie.imdb_id || movie.id);
}

export function tipoTitulo(movie: TituloPayload) {
  return movie.kind === "tv" ? ("serie" as const) : ("filme" as const);
}

function movieFromRow(row: {
  chave_titulo: string;
  tmdb_id: string | null;
  imdb_id?: string | null;
  tipo: "filme" | "serie";
  titulo: string;
  poster: string | null;
  backdrop?: string | null;
  ano?: number | null;
  dados_json?: unknown;
  progresso?: string | number | null;
  posicao_segundos?: number | null;
  temporada?: number | null;
  episodio?: number | null;
  estado?: "quero_assistir" | "assistindo" | "concluido" | "abandonado";
  favorito?: number | null;
  nao_e_para_mim?: number | null;
  estado_reproducao?: "aberto" | "reproduzindo" | "pausado" | "concluido";
  fonte_progresso?: "real" | "estimado";
  duracao_segundos?: number | null;
  criado_em?: string;
  atualizado_em?: string;
}): TituloPayload {
  const fromJson =
    row.dados_json && typeof row.dados_json === "object" && !Array.isArray(row.dados_json)
      ? (row.dados_json as TituloPayload)
      : null;

  const kind = row.tipo === "serie" ? ("tv" as const) : ("movie" as const);
  const id =
    fromJson?.id ||
    (row.tmdb_id ? `${kind}-${row.tmdb_id}` : row.chave_titulo);

  return {
    id,
    source: fromJson?.source,
    kind: fromJson?.kind || kind,
    list: fromJson?.list,
    imdb_id: fromJson?.imdb_id || row.imdb_id || undefined,
    tmdb_id: fromJson?.tmdb_id || row.tmdb_id || undefined,
    title: fromJson?.title || row.titulo,
    description: fromJson?.description,
    poster: fromJson?.poster || row.poster || "",
    backdrop: fromJson?.backdrop || row.backdrop || "",
    duration: fromJson?.duration,
    year: fromJson?.year || row.ano || undefined,
    genres: Array.isArray(fromJson?.genres) ? fromJson.genres : [],
    rating: fromJson?.rating,
    director: fromJson?.director,
    cast: fromJson?.cast,
    trailer: fromJson?.trailer,
    progress: row.progresso != null ? Number(row.progresso) : fromJson?.progress,
    season: row.temporada ?? fromJson?.season,
    episode: row.episodio ?? fromJson?.episode,
    available: fromJson?.available,
    provider_available: fromJson?.provider_available,
    playback_locale: fromJson?.playback_locale,
    is_brazilian: fromJson?.is_brazilian,
    positionSeconds: row.posicao_segundos ?? fromJson?.positionSeconds,
    libraryState: row.estado ?? fromJson?.libraryState,
    favorite: row.favorito != null ? Boolean(row.favorito) : fromJson?.favorite,
    notForMe: row.nao_e_para_mim != null ? Boolean(row.nao_e_para_mim) : fromJson?.notForMe,
    playbackState: row.estado_reproducao ?? fromJson?.playbackState,
    progressSource: row.fonte_progresso ?? fromJson?.progressSource,
    durationSeconds: row.duracao_segundos ?? fromJson?.durationSeconds,
    addedAt: row.criado_em ?? fromJson?.addedAt,
    updatedAt: row.atualizado_em ?? fromJson?.updatedAt,
  };
}

export async function listarMinhaLista(usuarioId: number) {
  return withDb(async (db) => {
    const rows = await db.select().from(lista_titulos).where(eq(lista_titulos.usuario_id, usuarioId)).orderBy(desc(lista_titulos.atualizado_em));
    const titleIds = rows.map((row) => row.id);
    const memberships = titleIds.length ? await db
      .select({ tituloId: lista_colecao_itens.titulo_id, id: lista_colecoes.id, name: lista_colecoes.nome })
      .from(lista_colecao_itens)
      .innerJoin(lista_colecoes, eq(lista_colecao_itens.colecao_id, lista_colecoes.id))
      .where(and(eq(lista_colecoes.usuario_id, usuarioId), inArray(lista_colecao_itens.titulo_id, titleIds))) : [];
    return rows.map((row) => ({ ...movieFromRow(row), collections: memberships.filter((item) => item.tituloId === row.id).map(({ id, name }) => ({ id, name })) }));
  });
}

export async function adicionarNaLista(usuarioId: number, movie: TituloPayload) {
  const chave = chaveTitulo(movie);
  const agora = agoraSql();
  await withDb(async (db) => {
    await db
      .insert(lista_titulos)
      .values({
        usuario_id: usuarioId,
        chave_titulo: chave,
        tmdb_id: movie.tmdb_id || null,
        imdb_id: movie.imdb_id || null,
        tipo: tipoTitulo(movie),
        titulo: movie.title,
        poster: movie.poster || null,
        backdrop: movie.backdrop || null,
        ano: movie.year ?? null,
        dados_json: movie,
        estado: movie.libraryState ?? "quero_assistir",
        favorito: movie.favorite ? 1 : 0,
        nao_e_para_mim: movie.notForMe ? 1 : 0,
        criado_em: agora,
        atualizado_em: agora,
      })
      .onDuplicateKeyUpdate({
        set: {
          tmdb_id: movie.tmdb_id || null,
          imdb_id: movie.imdb_id || null,
          tipo: tipoTitulo(movie),
          titulo: movie.title,
          poster: movie.poster || null,
          backdrop: movie.backdrop || null,
          ano: movie.year ?? null,
          dados_json: movie,
          atualizado_em: agora,
        },
      });
  });
  return chave;
}

export async function removerDaLista(usuarioId: number, chave: string) {
  await withDb(async (db) => {
    await db
      .delete(lista_titulos)
      .where(and(eq(lista_titulos.usuario_id, usuarioId), eq(lista_titulos.chave_titulo, chave)));
  });
}

export type LibraryState = "quero_assistir" | "assistindo" | "concluido" | "abandonado";

export async function atualizarItemLista(usuarioId: number, chave: string, patch: { estado?: LibraryState; favorito?: boolean; naoEParaMim?: boolean }) {
  const changes: { estado?: LibraryState; favorito?: number; nao_e_para_mim?: number; atualizado_em: string } = { atualizado_em: agoraSql() };
  if (patch.estado) changes.estado = patch.estado;
  if (typeof patch.favorito === "boolean") {
    changes.favorito = patch.favorito ? 1 : 0;
    if (patch.favorito) changes.nao_e_para_mim = 0;
  }
  if (typeof patch.naoEParaMim === "boolean") {
    changes.nao_e_para_mim = patch.naoEParaMim ? 1 : 0;
    if (patch.naoEParaMim) changes.favorito = 0;
  }
  return withDb(async (db) => {
    await db.update(lista_titulos).set(changes).where(and(eq(lista_titulos.usuario_id, usuarioId), eq(lista_titulos.chave_titulo, chave)));
    const rows = await db.select().from(lista_titulos).where(and(eq(lista_titulos.usuario_id, usuarioId), eq(lista_titulos.chave_titulo, chave))).limit(1);
    return rows[0] ? movieFromRow(rows[0]) : null;
  });
}

export async function listarColecoes(usuarioId: number) {
  return withDb((db) => db.select({ id: lista_colecoes.id, name: lista_colecoes.nome }).from(lista_colecoes)
    .where(eq(lista_colecoes.usuario_id, usuarioId)).orderBy(desc(lista_colecoes.criado_em)));
}

export async function criarColecao(usuarioId: number, rawName: string) {
  const name = rawName.trim().replace(/\s+/g, " ").slice(0, 60);
  if (name.length < 2) return { erro: "Dê um nome com pelo menos 2 caracteres.", colecao: null };
  return withDb(async (db) => {
    await db.insert(lista_colecoes).values({ usuario_id: usuarioId, nome: name, criado_em: agoraSql() });
    const rows = await db.select({ id: lista_colecoes.id, name: lista_colecoes.nome }).from(lista_colecoes)
      .where(and(eq(lista_colecoes.usuario_id, usuarioId), eq(lista_colecoes.nome, name))).limit(1);
    return { erro: null as string | null, colecao: rows[0] ?? null };
  });
}

export async function excluirColecao(usuarioId: number, id: number) {
  await withDb((db) => db.delete(lista_colecoes).where(and(eq(lista_colecoes.usuario_id, usuarioId), eq(lista_colecoes.id, id))));
}

export async function definirColecoesTitulo(usuarioId: number, chave: string, collectionIds: number[]) {
  return withDb(async (db) => {
    const titles = await db.select({ id: lista_titulos.id }).from(lista_titulos)
      .where(and(eq(lista_titulos.usuario_id, usuarioId), eq(lista_titulos.chave_titulo, chave))).limit(1);
    if (!titles[0]) return false;
    const wanted = [...new Set(collectionIds.filter((id) => Number.isInteger(id) && id > 0))].slice(0, 20);
    const allowed = wanted.length ? await db.select({ id: lista_colecoes.id }).from(lista_colecoes)
      .where(and(eq(lista_colecoes.usuario_id, usuarioId), inArray(lista_colecoes.id, wanted))) : [];
    await db.delete(lista_colecao_itens).where(eq(lista_colecao_itens.titulo_id, titles[0].id));
    if (allowed.length) await db.insert(lista_colecao_itens).values(allowed.map((item) => ({ colecao_id: item.id, titulo_id: titles[0].id, criado_em: agoraSql() })));
    return true;
  });
}

export async function listarEpisodiosAssistidos(usuarioId: number, chave: string) {
  return withDb((db) => db.select({ season: episodios_assistidos.temporada, episode: episodios_assistidos.episodio })
    .from(episodios_assistidos).where(and(eq(episodios_assistidos.usuario_id, usuarioId), eq(episodios_assistidos.chave_titulo, chave))));
}

export async function marcarEpisodioAssistido(usuarioId: number, chave: string, season: number, episode: number, watched: boolean) {
  await withDb(async (db) => {
    const where = and(eq(episodios_assistidos.usuario_id, usuarioId), eq(episodios_assistidos.chave_titulo, chave), eq(episodios_assistidos.temporada, season), eq(episodios_assistidos.episodio, episode));
    if (!watched) { await db.delete(episodios_assistidos).where(where); return; }
    await db.insert(episodios_assistidos).values({ usuario_id: usuarioId, chave_titulo: chave, temporada: season, episodio: episode, assistido_em: agoraSql() })
      .onDuplicateKeyUpdate({ set: { assistido_em: agoraSql() } });
  });
}

export async function listarHistorico(usuarioId: number, limite = 24) {
  const rows = await withDb((db) => db
      .select()
      .from(historico_assistidos)
      .where(eq(historico_assistidos.usuario_id, usuarioId))
      .orderBy(desc(historico_assistidos.assistido_em))
      .limit(limite));
  return rows.map(movieFromRow);
}

export async function registrarHistorico(usuarioId: number, movie: TituloPayload) {
  const chave = chaveTitulo(movie);
  const agora = agoraSql();
  await withDb(async (db) => {
    await db
      .insert(historico_assistidos)
      .values({
        usuario_id: usuarioId,
        chave_titulo: chave,
        tmdb_id: movie.tmdb_id || null,
        imdb_id: movie.imdb_id || null,
        tipo: tipoTitulo(movie),
        titulo: movie.title,
        poster: movie.poster || null,
        backdrop: movie.backdrop || null,
        ano: movie.year ?? null,
        dados_json: movie,
        assistido_em: agora,
      })
      .onDuplicateKeyUpdate({
        set: {
          tmdb_id: movie.tmdb_id || null,
          imdb_id: movie.imdb_id || null,
          tipo: tipoTitulo(movie),
          titulo: movie.title,
          poster: movie.poster || null,
          backdrop: movie.backdrop || null,
          ano: movie.year ?? null,
          dados_json: movie,
          assistido_em: agora,
        },
      });
  });
  return chave;
}

export async function listarProgresso(usuarioId: number, limite = 24) {
  const rows = await withDb((db) => db
      .select()
      .from(progresso_reproducao)
      .where(eq(progresso_reproducao.usuario_id, usuarioId))
      .orderBy(desc(progresso_reproducao.atualizado_em))
      .limit(limite));
  return rows.map(movieFromRow);
}

export async function obterProgresso(usuarioId: number, chave: string) {
  const rows = await withDb((db) => db
      .select()
      .from(progresso_reproducao)
      .where(
        and(eq(progresso_reproducao.usuario_id, usuarioId), eq(progresso_reproducao.chave_titulo, chave)),
      )
      .limit(1));
  return rows[0] ? movieFromRow(rows[0]) : null;
}

export async function removerProgresso(usuarioId: number, chave: string) {
  await withDb(async (db) => {
    await db
      .delete(progresso_reproducao)
      .where(
        and(eq(progresso_reproducao.usuario_id, usuarioId), eq(progresso_reproducao.chave_titulo, chave)),
      );
  });
}

export async function salvarProgresso(
  usuarioId: number,
  movie: TituloPayload,
  input: {
    progresso?: number;
    posicao_segundos?: number;
    temporada?: number | null;
    episodio?: number | null;
    estado?: "aberto" | "reproduzindo" | "pausado" | "concluido";
    fonte?: "real" | "estimado";
    duracao_segundos?: number | null;
    sessao_chave?: string;
    delta_segundos?: number;
  },
) {
  const chave = chaveTitulo(movie);
  const progresso = Math.max(0, Math.min(100, Number(input.progresso ?? movie.progress ?? 0) || 0));
  const posicao = Math.max(0, Math.floor(Number(input.posicao_segundos ?? movie.positionSeconds ?? 0) || 0));
  const temporada =
    input.temporada === null
      ? null
      : Number.isFinite(Number(input.temporada ?? movie.season))
        ? Math.max(1, Math.floor(Number(input.temporada ?? movie.season)))
        : null;
  const episodio =
    input.episodio === null
      ? null
      : Number.isFinite(Number(input.episodio ?? movie.episode))
        ? Math.max(1, Math.floor(Number(input.episodio ?? movie.episode)))
        : null;
  const agora = agoraSql();
  const estado = input.estado ?? (progresso >= 90 ? "concluido" : "reproduzindo");
  const fonte = input.fonte === "real" ? "real" : "estimado";
  const duracao = Number.isFinite(Number(input.duracao_segundos)) ? Math.max(1, Math.floor(Number(input.duracao_segundos))) : null;

  await withDb(async (db) => {
    await db
      .insert(progresso_reproducao)
      .values({
        usuario_id: usuarioId,
        chave_titulo: chave,
        tmdb_id: movie.tmdb_id || null,
        tipo: tipoTitulo(movie),
        titulo: movie.title,
        poster: movie.poster || null,
        progresso: progresso.toFixed(2),
        posicao_segundos: posicao,
        temporada,
        episodio,
        estado_reproducao: estado,
        fonte_progresso: fonte,
        duracao_segundos: duracao,
        iniciado_em: estado !== "aberto" ? agora : null,
        concluido_em: estado === "concluido" ? agora : null,
        atualizado_em: agora,
      })
      .onDuplicateKeyUpdate({
        set: {
          tmdb_id: movie.tmdb_id || null,
          tipo: tipoTitulo(movie),
          titulo: movie.title,
          poster: movie.poster || null,
          progresso: progresso.toFixed(2),
          posicao_segundos: posicao,
          temporada,
          episodio,
          estado_reproducao: estado,
          fonte_progresso: fonte,
          duracao_segundos: duracao,
          iniciado_em: estado !== "aberto" ? sql`coalesce(${progresso_reproducao.iniciado_em}, ${agora})` : sql`${progresso_reproducao.iniciado_em}`,
          concluido_em: estado === "concluido" ? agora : null,
          atualizado_em: agora,
        },
      });

    const sessionKey = String(input.sessao_chave || "").slice(0, 80);
    const delta = Math.min(300, Math.max(0, Math.floor(Number(input.delta_segundos) || 0)));
    if (sessionKey && estado !== "aberto") {
      await db.insert(sessoes_visualizacao).values({
        usuario_id: usuarioId,
        sessao_chave: sessionKey,
        chave_titulo: chave,
        titulo: movie.title.slice(0, 255),
        tipo: tipoTitulo(movie),
        ano: movie.year ?? null,
        generos_json: Array.isArray(movie.genres) ? movie.genres.slice(0, 12) : [],
        segundos_assistidos: delta,
        fonte_progresso: fonte,
        concluido: estado === "concluido" ? 1 : 0,
        iniciado_em: agora,
        atualizado_em: agora,
      }).onDuplicateKeyUpdate({ set: {
        segundos_assistidos: sql`${sessoes_visualizacao.segundos_assistidos} + ${delta}`,
        fonte_progresso: fonte === "real" ? "real" : sql`${sessoes_visualizacao.fonte_progresso}`,
        concluido: estado === "concluido" ? 1 : sql`${sessoes_visualizacao.concluido}`,
        atualizado_em: agora,
      } });
    }
    if (estado === "concluido") {
      await db.update(lista_titulos).set({ estado: "concluido", atualizado_em: agora }).where(and(eq(lista_titulos.usuario_id, usuarioId), eq(lista_titulos.chave_titulo, chave)));
    } else if (estado === "reproduzindo") {
      await db.update(lista_titulos).set({ estado: "assistindo", atualizado_em: agora }).where(and(eq(lista_titulos.usuario_id, usuarioId), eq(lista_titulos.chave_titulo, chave), eq(lista_titulos.estado, "quero_assistir")));
    }
  });

  if (estado === "concluido" || progresso >= 90) {
    await registrarHistorico(usuarioId, movie);
    if (movie.kind === "tv" && temporada && episodio) await marcarEpisodioAssistido(usuarioId, chave, temporada, episodio, true);
  }

  return obterProgresso(usuarioId, chave);
}

export async function estatisticasAdmin() {
  return withDb(async (db) => {
    const [usuariosCount] = await db.select({ total: sql<number>`count(*)` }).from(usuarios);
    const [listaCount] = await db.select({ total: sql<number>`count(*)` }).from(lista_titulos);
    const [historicoCount] = await db.select({ total: sql<number>`count(*)` }).from(historico_assistidos);
    const [progressoCount] = await db.select({ total: sql<number>`count(*)` }).from(progresso_reproducao);
    const [adminCount] = await db.select({ total: sql<number>`count(*)` }).from(usuarios).where(sql`${usuarios.administrador} = 1`);
    const [newUsersCount] = await db.select({ total: sql<number>`count(*)` }).from(usuarios).where(sql`${usuarios.criado_em} >= date_sub(current_timestamp, interval 30 day)`);
    const [activeUsersCount] = await db.select({ total: sql<number>`count(distinct ${sessoes_visualizacao.usuario_id})` })
      .from(sessoes_visualizacao)
      .where(sql`${sessoes_visualizacao.segundos_assistidos} > 0 and ${sessoes_visualizacao.iniciado_em} >= date_sub(utc_timestamp, interval 30 day)`);
    const [onlineUsersCount] = await db.select({ total: sql<number>`count(distinct ${presencas_usuarios.usuario_id})` })
      .from(presencas_usuarios)
      .where(sql`${presencas_usuarios.ativa} = 1 and ${presencas_usuarios.ultima_atividade_em} > date_sub(utc_timestamp, interval 75 second)`);
    const [watchTime] = await db.select({
      total: sql<number>`coalesce(floor(sum(${sessoes_visualizacao.segundos_assistidos}) / 60), 0)`,
      real: sql<number>`coalesce(floor(sum(case when ${sessoes_visualizacao.fonte_progresso} = 'real' then ${sessoes_visualizacao.segundos_assistidos} else 0 end) / 60), 0)`,
      estimated: sql<number>`coalesce(floor(sum(case when ${sessoes_visualizacao.fonte_progresso} = 'estimado' then ${sessoes_visualizacao.segundos_assistidos} else 0 end) / 60), 0)`,
    }).from(sessoes_visualizacao);
    const [completedCount] = await db.select({ total: sql<number>`count(*)` })
      .from(progresso_reproducao)
      .where(eq(progresso_reproducao.estado_reproducao, "concluido"));
    const [inProgressCount] = await db.select({ total: sql<number>`count(*)` })
      .from(progresso_reproducao)
      .where(sql`${progresso_reproducao.estado_reproducao} in ('reproduzindo', 'pausado') and ${progresso_reproducao.progresso} > 0 and ${progresso_reproducao.progresso} < 90`);
    return {
      usuarios: Number(usuariosCount?.total || 0),
      itens_lista: Number(listaCount?.total || 0),
      itens_historico: Number(historicoCount?.total || 0),
      itens_progresso: Number(progressoCount?.total || 0),
      administradores: Number(adminCount?.total || 0),
      novos_30_dias: Number(newUsersCount?.total || 0),
      usuarios_com_progresso: Number(activeUsersCount?.total || 0),
      usuarios_online: Number(onlineUsersCount?.total || 0),
      minutos_assistidos: Number(watchTime?.total || 0),
      minutos_reais: Number(watchTime?.real || 0),
      minutos_estimados: Number(watchTime?.estimated || 0),
      titulos_concluidos: Number(completedCount?.total || 0),
      reproducoes_em_andamento: Number(inProgressCount?.total || 0),
    };
  });
}
