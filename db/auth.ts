import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { and, asc, eq, gt } from "drizzle-orm";
import { withDb } from "./index";
import { describeDatabaseFailure, safeDatabaseError } from "./errors";
import { sessoes, usuarios, type Usuario } from "./schema";

export const SESSAO_COOKIE = "flixa_sessao";
export const SESSAO_DIAS = 14;

export type UsuarioPublico = {
  id: number;
  nome: string;
  email: string;
  administrador: boolean;
};

function agoraSql() {
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}

function expiraEmSql(dias = SESSAO_DIAS) {
  const date = new Date(Date.now() + dias * 24 * 60 * 60 * 1000);
  return date.toISOString().slice(0, 19).replace("T", " ");
}

export function hashSenha(senha: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(senha, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

export function verificarSenha(senha: string, armazenada: string) {
  const [algoritmo, salt, hash] = armazenada.split("$");
  if (algoritmo !== "scrypt" || !salt || !hash) return false;
  const atual = scryptSync(senha, salt, 64);
  const esperado = Buffer.from(hash, "hex");
  if (atual.length !== esperado.length) return false;
  return timingSafeEqual(atual, esperado);
}

export function gerarTokenSessao() {
  return createHash("sha256").update(randomBytes(48)).digest("hex");
}

export function paraUsuarioPublico(usuario: Usuario): UsuarioPublico {
  return {
    id: usuario.id,
    nome: usuario.nome,
    email: usuario.email,
    administrador: Number(usuario.administrador) === 1,
  };
}

export function lerTokenCookie(cookieHeader: string | null) {
  if (!cookieHeader) return null;
  const partes = cookieHeader.split(";").map((part) => part.trim());
  for (const parte of partes) {
    if (parte.startsWith(`${SESSAO_COOKIE}=`)) {
      return decodeURIComponent(parte.slice(SESSAO_COOKIE.length + 1));
    }
  }
  return null;
}

export function cookieDeveSerSecure(request?: Request) {
  if (process.env.FLIXA_COOKIE_SECURE === "1") return true;
  if (process.env.FLIXA_COOKIE_SECURE === "0") return false;

  const forwarded = request?.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  if (forwarded === "https") return true;
  if (forwarded === "http") return false;

  try {
    if (request && new URL(request.url).protocol === "https:") return true;
  } catch {
    // ignore
  }

  // Em produção atrás de proxy, Secure sem HTTPS real faz o browser descartar o cookie.
  return false;
}

export function montarCookieSessao(
  token: string,
  maxAgeSeconds = SESSAO_DIAS * 24 * 60 * 60,
  request?: Request,
) {
  const seguro = cookieDeveSerSecure(request) ? "; Secure" : "";
  return `${SESSAO_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${seguro}`;
}

export function montarCookieLogout(request?: Request) {
  const seguro = cookieDeveSerSecure(request) ? "; Secure" : "";
  return `${SESSAO_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${seguro}`;
}

export async function autenticarUsuario(email: string, senha: string) {
  return withDb(async (db) => {
    const rows = await db.select().from(usuarios).where(eq(usuarios.email, email.trim().toLowerCase())).limit(1);
    const usuario = rows[0];
    if (!usuario || !verificarSenha(senha, usuario.senha)) {
      return null;
    }
    return usuario;
  });
}

export async function cadastrarUsuario(input: { nome: string; email: string; senha: string }) {
  const nome = input.nome.trim().replace(/\s+/g, " ");
  const email = input.email.trim().toLowerCase();
  const senha = input.senha;

  if (nome.length < 2) {
    return { erro: "Informe um nome com pelo menos 2 caracteres.", usuario: null as Usuario | null };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { erro: "Informe um e-mail válido.", usuario: null as Usuario | null };
  }
  if (senha.length < 6) {
    return { erro: "A senha precisa ter pelo menos 6 caracteres.", usuario: null as Usuario | null };
  }

  return withDb(async (db) => {
    const existentes = await db.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.email, email)).limit(1);
    if (existentes[0]) {
      return { erro: "Este e-mail já está cadastrado.", usuario: null as Usuario | null };
    }

    const agora = agoraSql();
    await db.insert(usuarios).values({
      nome,
      email,
      senha: hashSenha(senha),
      administrador: 0,
      criado_em: agora,
      atualizado_em: agora,
    });

    const criados = await db.select().from(usuarios).where(eq(usuarios.email, email)).limit(1);
    const usuario = criados[0] ?? null;
    if (!usuario) {
      return { erro: "Não foi possível concluir o cadastro.", usuario: null as Usuario | null };
    }

    return { erro: null as string | null, usuario };
  });
}

export async function criarSessao(usuarioId: number) {
  const token = gerarTokenSessao();
  await withDb(async (db) => {
    await db.insert(sessoes).values({
      usuario_id: usuarioId,
      token,
      expira_em: expiraEmSql(),
      criado_em: agoraSql(),
    });
  });
  return token;
}

export async function obterUsuarioPorToken(token: string | null) {
  if (!token) return null;
  const selectSession = () => withDb((db) => db
    .select({
      id: usuarios.id,
      nome: usuarios.nome,
      email: usuarios.email,
      senha: usuarios.senha,
      administrador: usuarios.administrador,
      criado_em: usuarios.criado_em,
      atualizado_em: usuarios.atualizado_em,
    })
    .from(sessoes)
    .innerJoin(usuarios, eq(sessoes.usuario_id, usuarios.id))
    .where(and(eq(sessoes.token, token), gt(sessoes.expira_em, agoraSql())))
    .limit(1));

  let rows;
  try {
    rows = await selectSession();
  } catch (error) {
    if (describeDatabaseFailure(error).transient) {
      try {
        rows = await selectSession();
      } catch (retryError) {
        throw safeDatabaseError(retryError, "validar sessão após nova tentativa");
      }
    } else {
      throw safeDatabaseError(error, "validar sessão");
    }
  }

  return rows[0] ?? null;
}

export async function requireUsuario(request: Request) {
  const token = lerTokenCookie(request.headers.get("cookie"));
  const usuario = await obterUsuarioPorToken(token);
  if (!usuario) return null;
  return usuario;
}

export async function requireAdmin(request: Request) {
  const usuario = await requireUsuario(request);
  if (!usuario || Number(usuario.administrador) !== 1) return null;
  return usuario;
}

export async function encerrarSessao(token: string | null) {
  if (!token) return;
  await withDb(async (db) => {
    await db.delete(sessoes).where(eq(sessoes.token, token));
  });
}

export async function listarUsuariosAdmin() {
  return withDb(async (db) => {
    const rows = await db
      .select({
        id: usuarios.id,
        nome: usuarios.nome,
        email: usuarios.email,
        administrador: usuarios.administrador,
        criado_em: usuarios.criado_em,
      })
      .from(usuarios)
      .orderBy(asc(usuarios.id));
    return rows.map((row) => ({
      id: row.id,
      nome: row.nome,
      email: row.email,
      administrador: Number(row.administrador) === 1,
      criado_em: row.criado_em,
    }));
  });
}

export async function atualizarUsuarioAdmin(
  alvoId: number,
  input: { administrador?: boolean; nome?: string },
  adminId: number,
) {
  return withDb(async (db) => {
    const rows = await db.select().from(usuarios).where(eq(usuarios.id, alvoId)).limit(1);
    const alvo = rows[0];
    if (!alvo) return { erro: "Usuário não encontrado.", usuario: null as Usuario | null };

    if (input.administrador === false && alvoId === adminId) {
      return { erro: "Você não pode remover seu próprio acesso de administrador.", usuario: null as Usuario | null };
    }

    const patch: {
      atualizado_em: string;
      administrador?: number;
      nome?: string;
    } = { atualizado_em: agoraSql() };

    if (typeof input.administrador === "boolean") {
      patch.administrador = input.administrador ? 1 : 0;
    }
    if (typeof input.nome === "string" && input.nome.trim().length >= 2) {
      patch.nome = input.nome.trim().replace(/\s+/g, " ");
    }

    await db.update(usuarios).set(patch).where(eq(usuarios.id, alvoId));
    const atualizados = await db.select().from(usuarios).where(eq(usuarios.id, alvoId)).limit(1);
    return { erro: null as string | null, usuario: atualizados[0] ?? null };
  });
}

export async function excluirUsuarioAdmin(alvoId: number, adminId: number) {
  if (alvoId === adminId) {
    return { erro: "Você não pode excluir a própria conta por aqui." };
  }
  return withDb(async (db) => {
    const rows = await db.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.id, alvoId)).limit(1);
    if (!rows[0]) return { erro: "Usuário não encontrado." };
    await db.delete(usuarios).where(eq(usuarios.id, alvoId));
    return { erro: null as string | null };
  });
}
