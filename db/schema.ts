import { sql } from "drizzle-orm";
import {
  datetime,
  decimal,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  tinyint,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

/** Usuários do Flixa (login, perfil e permissão de administrador). */
export const usuarios = mysqlTable(
  "usuarios",
  {
    id: int("id").autoincrement().primaryKey(),
    nome: varchar("nome", { length: 120 }).notNull(),
    username: varchar("username", { length: 32 }),
    avatar_id: varchar("avatar_id", { length: 80 }),
    email: varchar("email", { length: 190 }).notNull(),
    senha: varchar("senha", { length: 255 }).notNull(),
    administrador: tinyint("administrador").notNull().default(0),
    criado_em: datetime("criado_em", { mode: "string" })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    atualizado_em: datetime("atualizado_em", { mode: "string" })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("usuarios_email_unico").on(table.email),
    uniqueIndex("usuarios_username_unico").on(table.username),
  ],
);

/** Sessões de autenticação (cookie flixa_sessao). */
export const sessoes = mysqlTable(
  "sessoes",
  {
    id: int("id").autoincrement().primaryKey(),
    usuario_id: int("usuario_id")
      .notNull()
      .references(() => usuarios.id, { onDelete: "cascade" }),
    token: varchar("token", { length: 128 }).notNull(),
    expira_em: datetime("expira_em", { mode: "string" }).notNull(),
    criado_em: datetime("criado_em", { mode: "string" })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    ultima_atividade_em: datetime("ultima_atividade_em", { mode: "string" })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("sessoes_token_unico").on(table.token),
    index("sessoes_usuario_idx").on(table.usuario_id),
    index("sessoes_presenca_idx").on(table.usuario_id, table.ultima_atividade_em),
  ],
);

/** Links temporários e de uso único para recuperação de senha. */
export const recuperacoes_senha = mysqlTable(
  "recuperacoes_senha",
  {
    id: int("id").autoincrement().primaryKey(),
    usuario_id: int("usuario_id")
      .notNull()
      .references(() => usuarios.id, { onDelete: "cascade" }),
    token_hash: varchar("token_hash", { length: 64 }).notNull(),
    expira_em: datetime("expira_em", { mode: "string" }).notNull(),
    usado_em: datetime("usado_em", { mode: "string" }),
    criado_em: datetime("criado_em", { mode: "string" })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("recuperacoes_senha_token_unico").on(table.token_hash),
    index("recuperacoes_senha_usuario_idx").on(table.usuario_id),
    index("recuperacoes_senha_expiracao_idx").on(table.expira_em),
  ],
);

/** Minha Lista de cada usuário. */
export const lista_titulos = mysqlTable(
  "lista_titulos",
  {
    id: int("id").autoincrement().primaryKey(),
    usuario_id: int("usuario_id")
      .notNull()
      .references(() => usuarios.id, { onDelete: "cascade" }),
    chave_titulo: varchar("chave_titulo", { length: 64 }).notNull(),
    tmdb_id: varchar("tmdb_id", { length: 32 }),
    imdb_id: varchar("imdb_id", { length: 32 }),
    tipo: mysqlEnum("tipo", ["filme", "serie"]).notNull().default("filme"),
    titulo: varchar("titulo", { length: 255 }).notNull(),
    poster: text("poster"),
    backdrop: text("backdrop"),
    ano: int("ano"),
    dados_json: json("dados_json"),
    criado_em: datetime("criado_em", { mode: "string" })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("lista_usuario_titulo_unico").on(table.usuario_id, table.chave_titulo),
    index("lista_usuario_idx").on(table.usuario_id),
  ],
);

/** Histórico de títulos abertos no player. */
export const historico_assistidos = mysqlTable(
  "historico_assistidos",
  {
    id: int("id").autoincrement().primaryKey(),
    usuario_id: int("usuario_id")
      .notNull()
      .references(() => usuarios.id, { onDelete: "cascade" }),
    chave_titulo: varchar("chave_titulo", { length: 64 }).notNull(),
    tmdb_id: varchar("tmdb_id", { length: 32 }),
    imdb_id: varchar("imdb_id", { length: 32 }),
    tipo: mysqlEnum("tipo", ["filme", "serie"]).notNull().default("filme"),
    titulo: varchar("titulo", { length: 255 }).notNull(),
    poster: text("poster"),
    backdrop: text("backdrop"),
    ano: int("ano"),
    dados_json: json("dados_json"),
    assistido_em: datetime("assistido_em", { mode: "string" })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("historico_usuario_titulo_unico").on(table.usuario_id, table.chave_titulo),
    index("historico_usuario_idx").on(table.usuario_id),
  ],
);

/** Progresso de reprodução (continuar assistindo). */
export const progresso_reproducao = mysqlTable(
  "progresso_reproducao",
  {
    id: int("id").autoincrement().primaryKey(),
    usuario_id: int("usuario_id")
      .notNull()
      .references(() => usuarios.id, { onDelete: "cascade" }),
    chave_titulo: varchar("chave_titulo", { length: 64 }).notNull(),
    tmdb_id: varchar("tmdb_id", { length: 32 }),
    tipo: mysqlEnum("tipo", ["filme", "serie"]).notNull().default("filme"),
    titulo: varchar("titulo", { length: 255 }).notNull(),
    poster: text("poster"),
    progresso: decimal("progresso", { precision: 5, scale: 2 }).notNull().default("0.00"),
    posicao_segundos: int("posicao_segundos").notNull().default(0),
    temporada: int("temporada"),
    episodio: int("episodio"),
    atualizado_em: datetime("atualizado_em", { mode: "string" })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("progresso_usuario_titulo_unico").on(table.usuario_id, table.chave_titulo),
    index("progresso_usuario_idx").on(table.usuario_id),
  ],
);

/** Relações de amizade e solicitações entre usuários. */
export const amizades = mysqlTable(
  "amizades",
  {
    id: int("id").autoincrement().primaryKey(),
    usuario_a_id: int("usuario_a_id")
      .notNull()
      .references(() => usuarios.id, { onDelete: "cascade" }),
    usuario_b_id: int("usuario_b_id")
      .notNull()
      .references(() => usuarios.id, { onDelete: "cascade" }),
    solicitante_id: int("solicitante_id")
      .notNull()
      .references(() => usuarios.id, { onDelete: "cascade" }),
    status: mysqlEnum("status", ["pendente", "aceita"]).notNull().default("pendente"),
    criado_em: datetime("criado_em", { mode: "string" })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    atualizado_em: datetime("atualizado_em", { mode: "string" })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("amizades_par_unico").on(table.usuario_a_id, table.usuario_b_id),
    index("amizades_usuario_a_idx").on(table.usuario_a_id),
    index("amizades_usuario_b_idx").on(table.usuario_b_id),
    index("amizades_status_idx").on(table.status),
  ],
);

/** Títulos enviados entre amigos; não aceita mensagens de texto livre. */
export const recomendacoes_amigos = mysqlTable(
  "recomendacoes_amigos",
  {
    id: int("id").autoincrement().primaryKey(),
    remetente_id: int("remetente_id")
      .notNull()
      .references(() => usuarios.id, { onDelete: "cascade" }),
    destinatario_id: int("destinatario_id")
      .notNull()
      .references(() => usuarios.id, { onDelete: "cascade" }),
    chave_titulo: varchar("chave_titulo", { length: 64 }).notNull(),
    tmdb_id: varchar("tmdb_id", { length: 32 }),
    imdb_id: varchar("imdb_id", { length: 32 }),
    tipo: mysqlEnum("tipo", ["filme", "serie"]).notNull().default("filme"),
    titulo: varchar("titulo", { length: 255 }).notNull(),
    poster: text("poster"),
    backdrop: text("backdrop"),
    ano: int("ano"),
    visualizado_em: datetime("visualizado_em", { mode: "string" }),
    enviado_em: datetime("enviado_em", { mode: "string" })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("recomendacoes_remetente_idx").on(table.remetente_id, table.enviado_em),
    index("recomendacoes_destinatario_idx").on(table.destinatario_id, table.visualizado_em, table.enviado_em),
  ],
);

/** Estado operacional dos provedores externos controlado pelo painel admin. */
export const servidores_player = mysqlTable(
  "servidores_player",
  {
    servidor_id: varchar("servidor_id", { length: 64 }).primaryKey(),
    habilitado: tinyint("habilitado").notNull().default(1),
    desabilitado_ate: datetime("desabilitado_ate", { mode: "string" }),
    ultimo_status: mysqlEnum("ultimo_status", ["unknown", "online", "degraded", "offline"])
      .notNull()
      .default("unknown"),
    ultimo_http_status: int("ultimo_http_status"),
    ultima_latencia_ms: int("ultima_latencia_ms"),
    ultima_mensagem: varchar("ultima_mensagem", { length: 500 }),
    ultimo_diagnostico: json("ultimo_diagnostico"),
    ultimo_teste_em: datetime("ultimo_teste_em", { mode: "string" }),
    atualizado_por: int("atualizado_por").references(() => usuarios.id, { onDelete: "set null" }),
    atualizado_em: datetime("atualizado_em", { mode: "string" })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("servidores_habilitado_idx").on(table.habilitado),
    index("servidores_status_idx").on(table.ultimo_status),
  ],
);

export type Usuario = typeof usuarios.$inferSelect;
export type Sessao = typeof sessoes.$inferSelect;
export type RecuperacaoSenha = typeof recuperacoes_senha.$inferSelect;
export type Amizade = typeof amizades.$inferSelect;
export type RecomendacaoAmigo = typeof recomendacoes_amigos.$inferSelect;
export type ServidorPlayer = typeof servidores_player.$inferSelect;
