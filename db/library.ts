import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "./index";
import { historico_assistidos, lista_titulos, progresso_reproducao, usuarios } from "./schema";

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
  };
}

export async function listarMinhaLista(usuarioId: number) {
  const db = await getDb();
  const rows = await db
    .select()
    .from(lista_titulos)
    .where(eq(lista_titulos.usuario_id, usuarioId))
    .orderBy(desc(lista_titulos.criado_em));
  return rows.map(movieFromRow);
}

export async function adicionarNaLista(usuarioId: number, movie: TituloPayload) {
  const db = await getDb();
  const chave = chaveTitulo(movie);
  const agora = agoraSql();
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
      criado_em: agora,
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
      },
    });
  return chave;
}

export async function removerDaLista(usuarioId: number, chave: string) {
  const db = await getDb();
  await db
    .delete(lista_titulos)
    .where(and(eq(lista_titulos.usuario_id, usuarioId), eq(lista_titulos.chave_titulo, chave)));
}

export async function listarHistorico(usuarioId: number, limite = 24) {
  const db = await getDb();
  const rows = await db
    .select()
    .from(historico_assistidos)
    .where(eq(historico_assistidos.usuario_id, usuarioId))
    .orderBy(desc(historico_assistidos.assistido_em))
    .limit(limite);
  return rows.map(movieFromRow);
}

export async function registrarHistorico(usuarioId: number, movie: TituloPayload) {
  const db = await getDb();
  const chave = chaveTitulo(movie);
  const agora = agoraSql();
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
  return chave;
}

export async function listarProgresso(usuarioId: number, limite = 24) {
  const db = await getDb();
  const rows = await db
    .select()
    .from(progresso_reproducao)
    .where(eq(progresso_reproducao.usuario_id, usuarioId))
    .orderBy(desc(progresso_reproducao.atualizado_em))
    .limit(limite);
  return rows.map(movieFromRow);
}

export async function obterProgresso(usuarioId: number, chave: string) {
  const db = await getDb();
  const rows = await db
    .select()
    .from(progresso_reproducao)
    .where(
      and(eq(progresso_reproducao.usuario_id, usuarioId), eq(progresso_reproducao.chave_titulo, chave)),
    )
    .limit(1);
  return rows[0] ? movieFromRow(rows[0]) : null;
}

export async function salvarProgresso(
  usuarioId: number,
  movie: TituloPayload,
  input: {
    progresso?: number;
    posicao_segundos?: number;
    temporada?: number | null;
    episodio?: number | null;
  },
) {
  const db = await getDb();
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
        atualizado_em: agora,
      },
    });

  return obterProgresso(usuarioId, chave);
}

export async function estatisticasAdmin() {
  const db = await getDb();
  const [usuariosCount] = await db.select({ total: sql<number>`count(*)` }).from(usuarios);
  const [listaCount] = await db.select({ total: sql<number>`count(*)` }).from(lista_titulos);
  const [historicoCount] = await db.select({ total: sql<number>`count(*)` }).from(historico_assistidos);
  const [progressoCount] = await db.select({ total: sql<number>`count(*)` }).from(progresso_reproducao);
  return {
    usuarios: Number(usuariosCount?.total || 0),
    itens_lista: Number(listaCount?.total || 0),
    itens_historico: Number(historicoCount?.total || 0),
    itens_progresso: Number(progressoCount?.total || 0),
  };
}
