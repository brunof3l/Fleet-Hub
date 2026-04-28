import { getDemoRecords, parseWorkbook } from "@/lib/fuel-normalization";
import { hasDatabaseConfig } from "@/lib/env";
import { getSqlClient } from "@/lib/neon";
import type {
  CleanupResult,
  DashboardFilters,
  DashboardKpis,
  DashboardSummary,
  FuelRecord,
  ParseWorkbookResult,
  ReportLogRecord,
  UploadResult,
} from "@/types/fuel";

type FuelRowQuery = {
  id?: number;
  data: string;
  horario?: string | null;
  veiculo?: string | null;
  apelido?: string | null;
  quantidade: number;
  medicao?: number | null;
  fornecedor?: string | null;
  valor_litro: number;
  tipo_combustivel?: string | null;
  custo_total: number;
  medida_percorrida?: number | null;
  autonomia_media?: number | null;
  observacoes?: string | null;
  criado_em?: string | null;
};

type ReportLogQuery = {
  id?: number;
  mes_referencia: string;
  data_envio?: string | null;
  status_email?: string | null;
};

function getPlateOrVehicleLabel(veiculo?: string | null): string {
  return veiculo?.trim() || "Veiculo nao identificado";
}

function normalizeOptionalText(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeOptionalNumber(value: unknown): string {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed.toFixed(3) : "0.000";
}

function buildRecordSignature(values: {
  date: string;
  time?: string | null;
  veiculo?: string | null;
  quantidade?: unknown;
  medicao?: unknown;
  fornecedor?: string | null;
  valorLitro?: unknown;
  tipoCombustivel?: string | null;
  custoTotal?: unknown;
  medidaPercorrida?: unknown;
  autonomiaMedia?: unknown;
  observacoes?: string | null;
}) {
  return [
    normalizeOptionalText(values.date),
    normalizeOptionalText(values.time),
    normalizeOptionalText(values.veiculo),
    normalizeOptionalNumber(values.quantidade),
    normalizeOptionalNumber(values.medicao),
    normalizeOptionalText(values.fornecedor),
    normalizeOptionalNumber(values.valorLitro),
    normalizeOptionalText(values.tipoCombustivel),
    normalizeOptionalNumber(values.custoTotal),
    normalizeOptionalNumber(values.medidaPercorrida),
    normalizeOptionalNumber(values.autonomiaMedia),
    normalizeOptionalText(values.observacoes),
  ].join("|");
}

function createKpis(records: FuelRecord[]): DashboardKpis {
  const totalCost = records.reduce((sum, item) => sum + item.totalCost, 0);
  const totalLiters = records.reduce((sum, item) => sum + item.quantity, 0);
  const averagePrice = totalLiters > 0 ? totalCost / totalLiters : 0;
  const fleetAverageAutonomy = records.length
    ? records.reduce((sum, item) => sum + item.autonomy, 0) / records.length
    : 0;

  return {
    totalCost,
    totalLiters,
    averagePrice,
    fleetAverageAutonomy,
    totalRecords: records.length,
  };
}

function buildDashboardSummaryFromRecords(
  records: FuelRecord[],
  source: DashboardSummary["source"],
  message?: string,
): DashboardSummary {
  const costMap = new Map<string, number>();
  const litersMap = new Map<string, number>();
  const monthlyCostMap = new Map<string, number>();
  const monthlyLitersMap = new Map<string, number>();

  records.forEach((record) => {
    costMap.set(record.vehicle, (costMap.get(record.vehicle) ?? 0) + record.totalCost);
    litersMap.set(record.vehicle, (litersMap.get(record.vehicle) ?? 0) + record.quantity);

    const monthKey = record.date ? record.date.slice(0, 7) : "sem-mes";
    monthlyCostMap.set(monthKey, (monthlyCostMap.get(monthKey) ?? 0) + record.totalCost);
    monthlyLitersMap.set(monthKey, (monthlyLitersMap.get(monthKey) ?? 0) + record.quantity);
  });

  return {
    source,
    message,
    kpis: createKpis(records),
    records,
    costByVehicle: Array.from(costMap.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((left, right) => right.value - left.value),
    litersByVehicle: Array.from(litersMap.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((left, right) => right.value - left.value),
    monthlyCost: Array.from(monthlyCostMap.entries())
      .map(([date, value]) => ({ date, value }))
      .sort((left, right) => left.date.localeCompare(right.date)),
    monthlyLiters: Array.from(monthlyLitersMap.entries())
      .map(([date, value]) => ({ date, value }))
      .sort((left, right) => left.date.localeCompare(right.date)),
    vehicleOptions: Array.from(new Set(records.map((record) => record.vehicle))).sort((a, b) =>
      a.localeCompare(b),
    ),
    fuelOptions: Array.from(new Set(records.map((record) => record.fuelType))).sort((a, b) =>
      a.localeCompare(b),
    ),
  };
}

function mapDbRowToFuelRecord(row: FuelRowQuery): FuelRecord {
  const vehicleName = getPlateOrVehicleLabel(row.veiculo);

  return {
    id: `db-${row.id ?? buildRecordSignature({
      date: row.data,
      time: row.horario,
      veiculo: row.veiculo,
      quantidade: row.quantidade,
      medicao: row.medicao,
      fornecedor: row.fornecedor,
      valorLitro: row.valor_litro,
      tipoCombustivel: row.tipo_combustivel,
      custoTotal: row.custo_total,
      medidaPercorrida: row.medida_percorrida,
      autonomiaMedia: row.autonomia_media,
      observacoes: row.observacoes,
    })}`,
    date: row.data,
    time: row.horario ?? "",
    vehicle: vehicleName,
    licensePlate: vehicleName,
    model: "",
    supplier: row.fornecedor ?? "Nao informado",
    fuelType: row.tipo_combustivel ?? "Nao informado",
    quantity: Number(row.quantidade ?? 0),
    pricePerLiter: Number(row.valor_litro ?? 0),
    totalCost: Number(row.custo_total ?? 0),
    odometer: Number(row.medida_percorrida ?? 0),
    autonomy: Number(row.autonomia_media ?? 0),
    sourceFormat: "infleet",
    sourceFileName: "neon",
    raw: {
      Veiculo: row.veiculo ?? "",
      Observacoes: row.observacoes ?? "",
    },
  };
}

function getNormalizedVehicleValue(record: FuelRecord): string {
  return String(record.raw.Veiculo ?? record.vehicle ?? "").trim();
}

function getObservationValue(record: FuelRecord): string {
  return String(record.raw.Observacoes ?? record.raw["Observações"] ?? "").trim();
}

function getMeasurementValue(record: FuelRecord): number {
  const value = record.raw.Medicao ?? record.raw["Medição"] ?? 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function applyClientSideFilters(records: FuelRecord[], filters: DashboardFilters): FuelRecord[] {
  return records.filter((record) => {
    if (filters.startDate && record.date < filters.startDate) {
      return false;
    }

    if (filters.endDate && record.date > filters.endDate) {
      return false;
    }

    if (filters.vehicle && filters.vehicle !== "todos" && record.vehicle !== filters.vehicle) {
      return false;
    }

    if (filters.fuelType && filters.fuelType !== "todos" && record.fuelType !== filters.fuelType) {
      return false;
    }

    if (filters.search) {
      const haystack = [
        record.date,
        record.vehicle,
        record.licensePlate,
        record.model,
        record.supplier,
        record.fuelType,
      ]
        .join(" ")
        .toLowerCase();

      if (!haystack.includes(filters.search.toLowerCase())) {
        return false;
      }
    }

    return true;
  });
}

export function getDemoDashboardSummary(): DashboardSummary {
  return buildDashboardSummaryFromRecords(
    getDemoRecords(),
    "demo",
    "Configure o DATABASE_URL do Neon para operar com persistencia real. Enquanto isso, o dashboard exibe dados demonstrativos.",
  );
}

export async function getDashboardSummary(filters: DashboardFilters): Promise<DashboardSummary> {
  if (!hasDatabaseConfig()) {
    return getDemoDashboardSummary();
  }

  const sql = getSqlClient();
  const rows = await sql<FuelRowQuery[]>`
    select
      id,
      data::text as data,
      horario::text as horario,
      veiculo,
      apelido,
      quantidade,
      medicao,
      fornecedor,
      valor_litro,
      tipo_combustivel,
      custo_total,
      medida_percorrida,
      autonomia_media,
      observacoes,
      criado_em::text as criado_em
    from abastecimentos
    order by data desc, horario desc nulls last, id desc
  `;

  const records = rows.map((row) => mapDbRowToFuelRecord(row));
  const filtered = applyClientSideFilters(records, filters);

  return buildDashboardSummaryFromRecords(filtered, "neon");
}

export async function ingestWorkbookToDatabase(fileName: string, buffer: ArrayBuffer): Promise<UploadResult> {
  if (!hasDatabaseConfig()) {
    throw new Error("DATABASE_URL nao configurado. Defina a conexao com o Neon antes de importar.");
  }

  const parsed = parseWorkbook(fileName, buffer);

  if (!parsed.records.length) {
    return {
      insertedCount: 0,
      skippedCount: 0,
      vehicleCount: 0,
      missingColumns: parsed.missingColumns,
      detectedFormat: parsed.detectedFormat,
      message: "Nenhum registro valido foi encontrado na planilha enviada.",
    };
  }

  const sql = getSqlClient();

  if (parsed.records.length) {
    await sql`
      insert into abastecimentos ${sql(
        parsed.records.map((record) => ({
          data: record.date,
          horario: record.time || null,
          veiculo: getNormalizedVehicleValue(record) || record.vehicle,
          apelido: null,
          quantidade: record.quantity,
          medicao: getMeasurementValue(record),
          fornecedor: record.supplier,
          valor_litro: record.pricePerLiter,
          tipo_combustivel: record.fuelType,
          custo_total: record.totalCost,
          medida_percorrida: record.odometer,
          autonomia_media: record.autonomy,
          observacoes: getObservationValue(record) || null,
        })),
        "data",
        "horario",
        "veiculo",
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
      )}
    `;
  }

  return {
    insertedCount: parsed.records.length,
    skippedCount: 0,
    vehicleCount: new Set(parsed.records.map((record) => record.vehicle)).size,
    missingColumns: parsed.missingColumns,
    detectedFormat: parsed.detectedFormat,
    message: `${parsed.records.length} abastecimentos foram salvos com sucesso.`,
  };
}

export async function getRecordsByPeriod(startDate: string, endDate: string): Promise<FuelRecord[]> {
  if (!hasDatabaseConfig()) {
    return [];
  }

  const sql = getSqlClient();
  const rows = await sql<FuelRowQuery[]>`
    select
      id,
      data::text as data,
      horario::text as horario,
      veiculo,
      apelido,
      quantidade,
      medicao,
      fornecedor,
      valor_litro,
      tipo_combustivel,
      custo_total,
      medida_percorrida,
      autonomia_media,
      observacoes,
      criado_em::text as criado_em
    from abastecimentos
    where data >= ${startDate}
      and data <= ${endDate}
    order by data asc, horario asc nulls last, id asc
  `;

  return rows.map((row) => mapDbRowToFuelRecord(row));
}

export async function getReportLogByMonth(reportMonth: string) {
  if (!hasDatabaseConfig()) {
    return null;
  }

  const sql = getSqlClient();
  const rows = await sql<ReportLogQuery[]>`
    select
      id,
      mes_referencia,
      data_envio::text as data_envio,
      status_email
    from relatorios_enviados
    where mes_referencia = ${reportMonth}
    limit 1
  `;

  if (!rows[0]) {
    return null;
  }

  return {
    report_month: rows[0].mes_referencia,
    period_start: rows[0].mes_referencia,
    period_end: rows[0].mes_referencia,
    file_name: "",
    status: rows[0].status_email === "sent" ? "sent" : rows[0].status_email === "failed" ? "failed" : "pending",
    sent_to: "",
    sent_at: rows[0].data_envio ?? null,
    error_message: null,
  } satisfies ReportLogRecord;
}

export async function upsertReportLog(record: ReportLogRecord) {
  if (!hasDatabaseConfig()) {
    return;
  }

  const sql = getSqlClient();
  const updated = await sql<{ id: number }[]>`
    update relatorios_enviados
    set
      data_envio = ${record.sent_at ?? new Date().toISOString()},
      status_email = ${record.status}
    where mes_referencia = ${record.report_month}
    returning id
  `;

  if (!updated.length) {
    await sql`
      insert into relatorios_enviados (
        mes_referencia,
        data_envio,
        status_email
      ) values (
        ${record.report_month},
        ${record.sent_at ?? new Date().toISOString()},
        ${record.status}
      )
    `;
  }
}

export async function cleanupRetention(retentionDays = 60): Promise<CleanupResult> {
  if (!hasDatabaseConfig()) {
    return {
      deletedFuelRows: 0,
    };
  }

  const threshold = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const sql = getSqlClient();
  const deletedRows = await sql<{ id: number }[]>`
    delete from abastecimentos
    where data < ${threshold}
    returning id
  `;

  return {
    deletedFuelRows: deletedRows.length,
  };
}

export function getPreviousMonthRange(referenceDate = new Date()) {
  const firstDayCurrentMonth = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1);
  const firstDayPreviousMonth = new Date(
    firstDayCurrentMonth.getFullYear(),
    firstDayCurrentMonth.getMonth() - 1,
    1,
  );
  const lastDayPreviousMonth = new Date(
    firstDayCurrentMonth.getFullYear(),
    firstDayCurrentMonth.getMonth(),
    0,
  );

  return {
    reportMonth: firstDayPreviousMonth.toISOString().slice(0, 10),
    periodStart: firstDayPreviousMonth.toISOString().slice(0, 10),
    periodEnd: lastDayPreviousMonth.toISOString().slice(0, 10),
  };
}

export function parseWorkbookFile(fileName: string, buffer: ArrayBuffer): ParseWorkbookResult {
  return parseWorkbook(fileName, buffer);
}
