import { createHash } from "node:crypto";

import { hasDatabaseConfig } from "@/lib/env";
import { getSqlClient } from "@/lib/neon";

export interface SpeedOccurrenceInput {
  vehicle: string;
  driver?: string | null;
  address?: string | null;
  location?: string | null;
  prefix?: string | null;
  maxSpeed: number;
  startDate: string;
  endDate?: string | null;
  durationMinutes?: string | null;
}

export interface SpeedOccurrence {
  id: number;
  vehicle: string;
  driver: string;
  address: string;
  location: string | null;
  prefix: string | null;
  maxSpeed: number;
  startDate: string;
  endDate: string | null;
}

export interface SaveSpeedResult {
  inserted: number;
  received: number;
}

const SPEED_COLUMNS = [
  "veiculo",
  "motorista",
  "endereco",
  "local",
  "prefixo",
  "velocidade_max",
  "inicio",
  "fim",
  "duracao",
  "ocorrencia_hash",
] as const;

let tableReady = false;

async function ensureSpeedTable(): Promise<void> {
  if (tableReady) {
    return;
  }

  const sql = getSqlClient();
  await sql`
    create table if not exists ocorrencias_velocidade (
      id bigserial primary key,
      veiculo text not null,
      motorista text,
      endereco text,
      local text,
      prefixo text,
      velocidade_max integer not null default 0,
      inicio timestamptz not null,
      fim timestamptz,
      duracao text,
      ocorrencia_hash text not null unique,
      criado_em timestamptz default now()
    )
  `;
  await sql`create index if not exists ix_ocorrencias_velocidade_inicio on ocorrencias_velocidade (inicio)`;
  tableReady = true;
}

function buildHash(vehicle: string, startIso: string, maxSpeed: number, address: string): string {
  return createHash("sha256")
    .update(`${vehicle}|${startIso}|${maxSpeed}|${address}`)
    .digest("hex");
}

function toIso(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export async function saveSpeedOccurrences(input: SpeedOccurrenceInput[]): Promise<SaveSpeedResult> {
  if (!hasDatabaseConfig()) {
    throw new Error("DATABASE_URL nao configurado.");
  }

  await ensureSpeedTable();

  const rows = input
    .map((item) => {
      const startIso = toIso(item.startDate);
      if (!item.vehicle || !startIso) {
        return null;
      }
      const address = String(item.address ?? "").trim();
      return {
        veiculo: String(item.vehicle).trim(),
        motorista: String(item.driver ?? "").trim() || null,
        endereco: address || null,
        local: item.location ?? null,
        prefixo: item.prefix ?? null,
        velocidade_max: Math.round(Number(item.maxSpeed) || 0),
        inicio: startIso,
        fim: toIso(item.endDate),
        duracao: item.durationMinutes ?? null,
        ocorrencia_hash: buildHash(String(item.vehicle).trim(), startIso, Math.round(Number(item.maxSpeed) || 0), address),
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  if (!rows.length) {
    return { inserted: 0, received: input.length };
  }

  const sql = getSqlClient();
  let inserted = 0;

  for (let index = 0; index < rows.length; index += 500) {
    const chunk = rows.slice(index, index + 500);
    const result = await sql<{ id: number }[]>`
      insert into ocorrencias_velocidade ${sql(chunk, ...SPEED_COLUMNS)}
      on conflict (ocorrencia_hash) do nothing
      returning id
    `;
    inserted += result.length;
  }

  return { inserted, received: input.length };
}

export async function getSpeedOccurrencesByPeriod(
  startDate: string,
  endDate: string,
): Promise<SpeedOccurrence[]> {
  if (!hasDatabaseConfig()) {
    return [];
  }

  await ensureSpeedTable();

  const sql = getSqlClient();
  const rows = await sql<
    {
      id: number;
      veiculo: string;
      motorista: string | null;
      endereco: string | null;
      local: string | null;
      prefixo: string | null;
      velocidade_max: number;
      inicio: string;
      fim: string | null;
    }[]
  >`
    select id, veiculo, motorista, endereco, local, prefixo, velocidade_max, inicio::text as inicio, fim::text as fim
    from ocorrencias_velocidade
    where inicio >= ${`${startDate}T00:00:00-03:00`}
      and inicio <= ${`${endDate}T23:59:59-03:00`}
    order by inicio asc
  `;

  return rows.map((row) => ({
    id: Number(row.id),
    vehicle: row.veiculo,
    driver: row.motorista ?? "",
    address: row.endereco ?? "",
    location: row.local,
    prefix: row.prefixo,
    maxSpeed: Number(row.velocidade_max ?? 0),
    startDate: row.inicio,
    endDate: row.fim,
  }));
}
