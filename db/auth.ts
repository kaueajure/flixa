import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { getDb } from "./index";
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

export function montarCookieSessao(token: string, maxAgeSeconds = SESSAO_DIAS * 24 * 60 * 60) {
  const seguro = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSAO_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${seguro}`;
}

export function montarCookieLogout() {
  const seguro = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSAO_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${seguro}`;
}

export async function autenticarUsuario(email: string, senha: string) {
  const db = await getDb();
  const rows = await db.select().from(usuarios).where(eq(usuarios.email, email.trim().toLowerCase())).limit(1);
  const usuario = rows[0];
  if (!usuario || !verificarSenha(senha, usuario.senha)) {
    return null;
  }
  return usuario;
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

  const db = await getDb();
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
}

export async function criarSessao(usuarioId: number) {
  const db = await getDb();
  const token = gerarTokenSessao();
  await db.insert(sessoes).values({
    usuario_id: usuarioId,
    token,
    expira_em: expiraEmSql(),
    criado_em: agoraSql(),
  });
  return token;
}

export async function obterUsuarioPorToken(token: string | null) {
  if (!token) return null;
  const db = await getDb();
  const rows = await db
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
    .limit(1);

  return rows[0] ?? null;
}

export async function encerrarSessao(token: string | null) {
  if (!token) return;
  const db = await getDb();
  await db.delete(sessoes).where(eq(sessoes.token, token));
}
