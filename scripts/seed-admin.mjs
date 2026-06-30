import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes, scryptSync } from "node:crypto";

import postgres from "postgres";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Minimal .env.local loader so the script works without extra deps.
async function loadEnvLocal() {
  const envPath = path.join(__dirname, "..", ".env.local");
  let content = "";
  try {
    content = await readFile(envPath, "utf8");
  } catch {
    return;
  }

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const eq = line.indexOf("=");
    if (eq === -1) {
      continue;
    }
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function hashPassword(password) {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

async function main() {
  await loadEnvLocal();

  const databaseUrl = process.env.DATABASE_URL;
  const email = String(process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
  const password = String(process.env.ADMIN_PASSWORD ?? "");
  const nome = String(process.env.ADMIN_NAME ?? "").trim() || "Administrador";

  if (!databaseUrl) {
    throw new Error("DATABASE_URL nao configurado no .env.local.");
  }
  if (!email || !email.includes("@")) {
    throw new Error("Defina ADMIN_EMAIL (e-mail valido) no .env.local.");
  }
  if (password.length < 8) {
    throw new Error("Defina ADMIN_PASSWORD com ao menos 8 caracteres no .env.local.");
  }

  const sql = postgres(databaseUrl, { max: 1, prepare: false });

  try {
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

    const rows = await sql`
      insert into usuarios (nome, email, senha_hash, role, ativo)
      values (${nome}, ${email}, ${hashPassword(password)}, 'admin', true)
      on conflict (email) do update set
        senha_hash = excluded.senha_hash,
        role = 'admin',
        ativo = true,
        nome = excluded.nome
      returning id, email
    `;

    console.log(`Administrador pronto: ${rows[0].email} (id ${rows[0].id}).`);
    console.log("Faca login em /login com esse e-mail e a senha definida em ADMIN_PASSWORD.");
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
