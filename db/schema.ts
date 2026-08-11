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
  (table) => [uniqueIndex("usuarios_email_unico").on(table.email)],
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
  },
  (table) => [
    uniqueIndex("sessoes_token_unico").on(table.token),
    index("sessoes_usuario_idx").on(table.usuario_id),
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
    atualizado_em: datetime("atualizado_em", { mode: "string" })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("progresso_usuario_titulo_unico").on(table.usuario_id, table.chave_titulo),
    index("progresso_usuario_idx").on(table.usuario_id),
  ],
);

export type Usuario = typeof usuarios.$inferSelect;
export type Sessao = typeof sessoes.$inferSelect;
