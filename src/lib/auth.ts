import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";

import { hasDatabaseConfig } from "@/lib/env";
import { getSqlClient } from "@/lib/neon";

export const SESSION_COOKIE = "fh_session";
const SESSION_TTL_DAYS = 7;
const SCRYPT_KEYLEN = 64;

export type UserRole = "admin" | "user";

export interface SessionUser {
  id: number;
  nome: string;
  email: string;
  role: UserRole;
}

export interface AdminUserView {
  id: number;
  nome: string;
  email: string;
  role: UserRole;
  ativo: boolean;
  criadoEm: string | null;
  ultimoLogin: string | null;
}

type UserRow = {
  id: number;
  nome: string;
  email: string;
  senha_hash: string;
  role: UserRole;
  ativo: boolean;
};

let tablesReady = false;

async function ensureAuthTables(): Promise<void> {
  if (tablesReady) {
    return;
  }

  const sql = getSqlClient();

  await sql`
    create table if not exists usuarios (
      id bigserial primary key,
      nome text not null,
      email text not null unique,
      senha_hash text not null,
      role text not null default 'user',
      ativo boolean not null default true,
      criado_em timestamptz default now(),
      ultimo_login timestamptz
    )
  `;

  await sql`
    create table if not exists sessoes (
      id bigserial primary key,
      usuario_id bigint not null references usuarios(id) on delete cascade,
      token_hash text not null unique,
      expira_em timestamptz not null,
      criado_em timestamptz default now()
    )
  `;

  await sql`create index if not exists ix_sessoes_token_hash on sessoes (token_hash)`;

  tablesReady = true;
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, SCRYPT_KEYLEN);
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, saltHex, hashHex] = String(stored ?? "").split("$");
  if (scheme !== "scrypt" || !saltHex || !hashHex) {
    return false;
  }

  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  if (!expected.length) {
    return false;
  }

  const derived = scryptSync(password, salt, expected.length);
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function normalizeEmail(email: string): string {
  return String(email ?? "").trim().toLowerCase();
}

function normalizeRole(role: unknown): UserRole {
  return role === "admin" ? "admin" : "user";
}

export function validatePasswordStrength(password: string): string | null {
  if (typeof password !== "string" || password.length < 8) {
    return "A senha deve ter ao menos 8 caracteres.";
  }
  return null;
}

export async function createUser(input: {
  nome: string;
  email: string;
  senha: string;
  role?: UserRole;
}): Promise<AdminUserView> {
  await ensureAuthTables();

  const nome = String(input.nome ?? "").trim();
  const email = normalizeEmail(input.email);
  const role = normalizeRole(input.role);

  if (!nome) {
    throw new Error("Informe o nome do usuario.");
  }
  if (!email || !email.includes("@")) {
    throw new Error("Informe um e-mail valido.");
  }
  const passwordError = validatePasswordStrength(input.senha);
  if (passwordError) {
    throw new Error(passwordError);
  }

  const sql = getSqlClient();
  const existing = await sql<{ id: number }[]>`select id from usuarios where email = ${email} limit 1`;
  if (existing.length) {
    throw new Error("Ja existe um usuario com esse e-mail.");
  }

  const rows = await sql<
    { id: number; nome: string; email: string; role: UserRole; ativo: boolean; criado_em: string | null; ultimo_login: string | null }[]
  >`
    insert into usuarios (nome, email, senha_hash, role)
    values (${nome}, ${email}, ${hashPassword(input.senha)}, ${role})
    returning id, nome, email, role, ativo, criado_em::text as criado_em, ultimo_login::text as ultimo_login
  `;

  return mapAdminUser(rows[0]);
}

function mapAdminUser(row: {
  id: number;
  nome: string;
  email: string;
  role: UserRole;
  ativo: boolean;
  criado_em: string | null;
  ultimo_login: string | null;
}): AdminUserView {
  return {
    id: Number(row.id),
    nome: row.nome,
    email: row.email,
    role: normalizeRole(row.role),
    ativo: Boolean(row.ativo),
    criadoEm: row.criado_em,
    ultimoLogin: row.ultimo_login,
  };
}

export async function listUsers(): Promise<AdminUserView[]> {
  await ensureAuthTables();
  const sql = getSqlClient();
  const rows = await sql<
    { id: number; nome: string; email: string; role: UserRole; ativo: boolean; criado_em: string | null; ultimo_login: string | null }[]
  >`
    select id, nome, email, role, ativo, criado_em::text as criado_em, ultimo_login::text as ultimo_login
    from usuarios
    order by criado_em asc nulls first, id asc
  `;
  return rows.map(mapAdminUser);
}

async function countActiveAdmins(excludeId?: number): Promise<number> {
  const sql = getSqlClient();
  const rows = await sql<{ total: number }[]>`
    select count(*)::int as total
    from usuarios
    where role = 'admin' and ativo = true
      and (${excludeId ?? null}::bigint is null or id <> ${excludeId ?? null})
  `;
  return rows[0]?.total ?? 0;
}

export async function setUserActive(id: number, ativo: boolean): Promise<void> {
  await ensureAuthTables();

  if (!ativo && (await countActiveAdmins(id)) === 0) {
    const sql = getSqlClient();
    const target = await sql<{ role: UserRole }[]>`select role from usuarios where id = ${id} limit 1`;
    if (target[0]?.role === "admin") {
      throw new Error("Nao e possivel desativar o ultimo administrador ativo.");
    }
  }

  const sql = getSqlClient();
  await sql`update usuarios set ativo = ${ativo} where id = ${id}`;
  if (!ativo) {
    await sql`delete from sessoes where usuario_id = ${id}`;
  }
}

export async function resetUserPassword(id: number, novaSenha: string): Promise<void> {
  await ensureAuthTables();
  const passwordError = validatePasswordStrength(novaSenha);
  if (passwordError) {
    throw new Error(passwordError);
  }
  const sql = getSqlClient();
  await sql`update usuarios set senha_hash = ${hashPassword(novaSenha)} where id = ${id}`;
  await sql`delete from sessoes where usuario_id = ${id}`;
}

export async function deleteUser(id: number): Promise<void> {
  await ensureAuthTables();

  const sql = getSqlClient();
  const target = await sql<{ role: UserRole }[]>`select role from usuarios where id = ${id} limit 1`;
  if (target[0]?.role === "admin" && (await countActiveAdmins(id)) === 0) {
    throw new Error("Nao e possivel remover o ultimo administrador ativo.");
  }

  await sql`delete from usuarios where id = ${id}`;
}

export async function verifyCredentials(email: string, senha: string): Promise<SessionUser | null> {
  await ensureAuthTables();

  const sql = getSqlClient();
  const rows = await sql<UserRow[]>`
    select id, nome, email, senha_hash, role, ativo
    from usuarios
    where email = ${normalizeEmail(email)}
    limit 1
  `;

  const user = rows[0];
  if (!user || !user.ativo) {
    return null;
  }

  if (!verifyPassword(String(senha ?? ""), user.senha_hash)) {
    return null;
  }

  await sql`update usuarios set ultimo_login = now() where id = ${user.id}`;

  return { id: Number(user.id), nome: user.nome, email: user.email, role: normalizeRole(user.role) };
}

export async function createSession(userId: number): Promise<void> {
  await ensureAuthTables();

  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
  const sql = getSqlClient();

  await sql`
    insert into sessoes (usuario_id, token_hash, expira_em)
    values (${userId}, ${hashToken(token)}, ${expiresAt.toISOString()})
  `;

  cookies().set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_DAYS * 24 * 60 * 60,
  });
}

export async function getSessionUser(): Promise<SessionUser | null> {
  if (!hasDatabaseConfig()) {
    return null;
  }

  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) {
    return null;
  }

  await ensureAuthTables();
  const sql = getSqlClient();
  const rows = await sql<{ id: number; nome: string; email: string; role: UserRole }[]>`
    select u.id, u.nome, u.email, u.role
    from sessoes s
    join usuarios u on u.id = s.usuario_id
    where s.token_hash = ${hashToken(token)}
      and s.expira_em > now()
      and u.ativo = true
    limit 1
  `;

  const user = rows[0];
  return user ? { id: Number(user.id), nome: user.nome, email: user.email, role: normalizeRole(user.role) } : null;
}

export async function destroySession(): Promise<void> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (token && hasDatabaseConfig()) {
    await ensureAuthTables();
    const sql = getSqlClient();
    await sql`delete from sessoes where token_hash = ${hashToken(token)}`;
  }
  cookies().delete(SESSION_COOKIE);
}

/** Page guard: redirects to /login when not authenticated. */
export async function requirePageUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }
  return user;
}

/** Page guard: redirects non-admins away. */
export async function requirePageAdmin(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }
  if (user.role !== "admin") {
    redirect("/");
  }
  return user;
}

export function jsonUnauthorized(): Response {
  return Response.json({ message: "Nao autenticado." }, { status: 401 });
}

export function jsonForbidden(): Response {
  return Response.json({ message: "Acesso restrito." }, { status: 403 });
}

/** API guard. Returns the user, or a Response to short-circuit the handler. */
export async function requireApiUser(): Promise<SessionUser | Response> {
  const user = await getSessionUser();
  if (!user) {
    return jsonUnauthorized();
  }
  return user;
}

/** API guard for admin-only routes. */
export async function requireApiAdmin(): Promise<SessionUser | Response> {
  const user = await getSessionUser();
  if (!user) {
    return jsonUnauthorized();
  }
  if (user.role !== "admin") {
    return jsonForbidden();
  }
  return user;
}
