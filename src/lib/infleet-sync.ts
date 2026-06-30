import { hasDatabaseConfig } from "@/lib/env";
import { fetchInfleetFuellings, hasInfleetConfig } from "@/lib/infleet-service";
import { getSqlClient } from "@/lib/neon";
import type { InfleetFuelling, InfleetSyncResult } from "@/types/fuel";

export const DEFAULT_SYNC_START = "2026-05-01";
const CHUNK_SIZE = 500;

export interface SyncedInfleetRecord {
  id: string;
  date: string;
  plate: string;
  vehicleName: string;
  liters: number;
  cost: number;
  unitPrice: number;
  fuelType: string;
  supplier: string;
}

let columnsReady = false;

/**
 * Ensures the abastecimentos table has the columns we need to mirror Infleet
 * records idempotently (infleet_id as the upsert key, placa for matching).
 */
async function ensureSyncColumns(): Promise<void> {
  if (columnsReady) {
    return;
  }

  const sql = getSqlClient();

  await sql`
    create table if not exists abastecimentos (
      id bigserial primary key,
      data date not null,
      horario time,
      veiculo text,
      apelido text,
      quantidade numeric(12,3) not null default 0,
      medicao numeric(12,3),
      fornecedor text,
      valor_litro numeric(12,3) not null default 0,
      tipo_combustivel text,
      custo_total numeric(12,2) not null default 0,
      medida_percorrida numeric(12,2),
      autonomia_media numeric(12,3),
      observacoes text,
      criado_em timestamptz default now()
    )
  `;

  await sql`alter table abastecimentos add column if not exists infleet_id text`;
  await sql`alter table abastecimentos add column if not exists placa text`;
  await sql`create unique index if not exists ux_abastecimentos_infleet_id on abastecimentos (infleet_id)`;

  columnsReady = true;
}

function todayIsoInBrazil(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function toRow(fuelling: InfleetFuelling) {
  return {
    infleet_id: fuelling.id,
    data: fuelling.date,
    horario: fuelling.time || null,
    veiculo: fuelling.vehicleName,
    placa: fuelling.rawPlate || null,
    apelido: fuelling.vehicleName,
    quantidade: fuelling.liters,
    medicao: fuelling.odometer || null,
    fornecedor: fuelling.supplier || "Infleet",
    valor_litro: fuelling.unitPrice,
    tipo_combustivel: fuelling.fuelType,
    custo_total: fuelling.cost,
    medida_percorrida: fuelling.distanceKm || null,
    autonomia_media: fuelling.autonomy || null,
    observacoes: "Importado do Infleet",
  };
}

const UPSERT_COLUMNS = [
  "infleet_id",
  "data",
  "horario",
  "veiculo",
  "placa",
  "apelido",
  "quantidade",
  "medicao",
  "fornecedor",
  "valor_litro",
  "tipo_combustivel",
  "custo_total",
  "medida_percorrida",
  "autonomia_media",
  "observacoes",
] as const;

/**
 * Pulls every Infleet fuelling since `fromDate` and upserts them into the
 * abastecimentos table (keyed by infleet_id), so the Combustivel dashboard and
 * the invoice reconciliation both work off the same mirrored data.
 */
export async function syncInfleetFuellings(fromDate?: string, toDate?: string): Promise<InfleetSyncResult> {
  if (!hasDatabaseConfig()) {
    throw new Error("DATABASE_URL nao configurado.");
  }
  if (!hasInfleetConfig()) {
    throw new Error("INFLEET_API_TOKEN nao configurado.");
  }

  const start = fromDate?.trim() || DEFAULT_SYNC_START;
  const end = toDate?.trim() || todayIsoInBrazil();

  await ensureSyncColumns();

  const fuellings = await fetchInfleetFuellings(start, end);
  const rows = fuellings.filter((item) => item.date && item.rawPlate).map(toRow);

  const sql = getSqlClient();
  let inserted = 0;

  for (let index = 0; index < rows.length; index += CHUNK_SIZE) {
    const chunk = rows.slice(index, index + CHUNK_SIZE);
    const result = await sql<{ inserted: boolean }[]>`
      insert into abastecimentos ${sql(chunk, ...UPSERT_COLUMNS)}
      on conflict (infleet_id) do update set
        data = excluded.data,
        horario = excluded.horario,
        veiculo = excluded.veiculo,
        placa = excluded.placa,
        apelido = excluded.apelido,
        quantidade = excluded.quantidade,
        medicao = excluded.medicao,
        fornecedor = excluded.fornecedor,
        valor_litro = excluded.valor_litro,
        tipo_combustivel = excluded.tipo_combustivel,
        custo_total = excluded.custo_total,
        medida_percorrida = excluded.medida_percorrida,
        autonomia_media = excluded.autonomia_media,
        observacoes = excluded.observacoes
      returning (xmax = 0) as inserted
    `;
    inserted += result.filter((row) => row.inserted).length;
  }

  const total = rows.length;
  const updated = total - inserted;

  return {
    inserted,
    updated,
    total,
    fromDate: start,
    toDate: end,
    message:
      total === 0
        ? "Nenhum abastecimento encontrado no Infleet para o periodo."
        : `Sincronizacao concluida: ${inserted} novo(s) e ${updated} atualizado(s) (de ${start} a ${end}).`,
  };
}

/** Reads the mirrored Infleet records for invoice reconciliation. */
export async function getSyncedInfleetRecords(
  startDate: string,
  endDate: string,
): Promise<SyncedInfleetRecord[]> {
  if (!hasDatabaseConfig()) {
    return [];
  }

  await ensureSyncColumns();

  const sql = getSqlClient();
  const rows = await sql<
    {
      infleet_id: string;
      data: string;
      placa: string | null;
      veiculo: string | null;
      quantidade: number;
      custo_total: number;
      valor_litro: number;
      tipo_combustivel: string | null;
      fornecedor: string | null;
    }[]
  >`
    select
      infleet_id,
      data::text as data,
      placa,
      veiculo,
      quantidade,
      custo_total,
      valor_litro,
      tipo_combustivel,
      fornecedor
    from abastecimentos
    where infleet_id is not null
      and data >= ${startDate}
      and data <= ${endDate}
  `;

  return rows.map((row) => ({
    id: row.infleet_id,
    date: row.data,
    plate: String(row.placa ?? "").toUpperCase().replace(/[^A-Z0-9]/g, ""),
    vehicleName: row.veiculo ?? "",
    liters: Number(row.quantidade ?? 0),
    cost: Number(row.custo_total ?? 0),
    unitPrice: Number(row.valor_litro ?? 0),
    fuelType: row.tipo_combustivel ?? "",
    supplier: row.fornecedor ?? "",
  }));
}
