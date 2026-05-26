import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import postgres from "postgres";

function parseEnvFile(content) {
  const values = {};

  content.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      return;
    }

    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex <= 0) {
      return;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    values[key] = value;
  });

  return values;
}

function getDatabaseUrl() {
  if (process.env.DATABASE_URL?.trim()) {
    return process.env.DATABASE_URL.trim();
  }

  const envFiles = [".env.local", ".env"];

  for (const envFile of envFiles) {
    const envPath = path.join(process.cwd(), envFile);

    if (!existsSync(envPath)) {
      continue;
    }

    const values = parseEnvFile(readFileSync(envPath, "utf8"));

    if (values.DATABASE_URL?.trim()) {
      return values.DATABASE_URL.trim();
    }
  }

  throw new Error("DATABASE_URL nao configurado em variavel de ambiente, .env.local ou .env.");
}

async function main() {
  const databaseUrl = getDatabaseUrl();
  const sql = postgres(databaseUrl, {
    max: 1,
    prepare: false,
  });

  try {
    const rows = await sql`select count(*)::int as total from frota_veiculos`;
    const totalBefore = rows[0]?.total ?? 0;

    await sql`truncate table frota_veiculos restart identity`;

    console.log(`Tabela frota_veiculos limpa com sucesso. Registros removidos: ${totalBefore}.`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Falha ao limpar a tabela frota_veiculos.");
  process.exitCode = 1;
});
