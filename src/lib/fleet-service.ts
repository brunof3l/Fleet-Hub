import { getDemoRecords, parseWorkbook } from "@/lib/fuel-normalization";
import { hasDatabaseConfig } from "@/lib/env";
import { getSqlClient } from "@/lib/neon";
import type {
  CleanupResult,
  DashboardFilters,
  DashboardKpis,
  DashboardSummary,
  FuelRecord,
  FuelPriceRule,
  FuelPriceValidationStatus,
  FuelReportFilters,
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

type FuelPriceRuleQuery = {
  id?: number;
  fornecedor: string;
  fornecedor_chave: string;
  tipo_combustivel: string;
  tipo_combustivel_chave: string;
  valor_litro: number;
  vigencia_inicio: string;
  criado_em?: string | null;
};

const PRICE_TOLERANCE = 0.05;

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

function normalizeConfigText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function normalizeSupplierKey(value: unknown): string {
  return normalizeConfigText(value);
}

function normalizeFuelTypeKey(value: unknown): string {
  const normalized = normalizeConfigText(value);

  if (!normalized) {
    return "";
  }

  if (normalized.includes("arla")) {
    return "arla";
  }

  if (normalized.includes("diesel") && (normalized.includes("s10") || normalized.includes("s 10"))) {
    return "diesel-s10";
  }

  if (normalized.includes("diesel")) {
    return "diesel";
  }

  if (normalized.includes("gasolina")) {
    return "gasolina";
  }

  if (normalized.includes("alcool") || normalized.includes("etanol")) {
    return "alcool";
  }

  return normalized;
}

function normalizeDuplicateText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
}

function buildDuplicateKey(values: {
  date: string;
  vehicle: string;
  quantity: number;
  totalCost: number;
}) {
  return [
    values.date,
    normalizeDuplicateText(values.vehicle),
    normalizeOptionalNumber(values.quantity),
    normalizeOptionalNumber(values.totalCost),
  ].join("|");
}

function mapPriceRuleRow(row: FuelPriceRuleQuery): FuelPriceRule {
  return {
    id: String(row.id ?? `${row.fornecedor_chave}-${row.tipo_combustivel_chave}-${row.vigencia_inicio}`),
    supplier: row.fornecedor,
    fuelType: row.tipo_combustivel,
    pricePerLiter: Number(row.valor_litro ?? 0),
    effectiveFrom: row.vigencia_inicio,
    createdAt: row.criado_em ?? null,
  };
}

async function ensureFuelPriceRuleTable() {
  const sql = getSqlClient();

  await sql`
    create table if not exists parametros_preco_combustivel (
      id bigserial primary key,
      fornecedor text not null,
      fornecedor_chave text not null,
      tipo_combustivel text not null,
      tipo_combustivel_chave text not null,
      valor_litro numeric(12,3) not null,
      vigencia_inicio date not null,
      criado_em timestamptz default now()
    )
  `;

  await sql`
    create unique index if not exists ux_parametros_preco_combustivel_chave
    on parametros_preco_combustivel (fornecedor_chave, tipo_combustivel_chave, vigencia_inicio)
  `;
}

async function getFuelPriceRules(): Promise<FuelPriceRule[]> {
  await ensureFuelPriceRuleTable();

  const sql = getSqlClient();
  const rows = await sql<FuelPriceRuleQuery[]>`
    select
      id,
      fornecedor,
      fornecedor_chave,
      tipo_combustivel,
      tipo_combustivel_chave,
      valor_litro,
      vigencia_inicio::text as vigencia_inicio,
      criado_em::text as criado_em
    from parametros_preco_combustivel
    order by fornecedor asc, tipo_combustivel asc, vigencia_inicio desc, id desc
  `;

  return rows.map((row) => mapPriceRuleRow(row));
}

function applyPriceValidation(records: FuelRecord[], rules: FuelPriceRule[]): FuelRecord[] {
  const groupedRules = new Map<string, FuelPriceRule[]>();

  rules.forEach((rule) => {
    const key = `${normalizeSupplierKey(rule.supplier)}|${normalizeFuelTypeKey(rule.fuelType)}`;
    const current = groupedRules.get(key) ?? [];
    current.push(rule);
    groupedRules.set(key, current);
  });

  groupedRules.forEach((currentRules) => {
    currentRules.sort((left, right) => right.effectiveFrom.localeCompare(left.effectiveFrom));
  });

  return records.map((record) => {
    const key = `${normalizeSupplierKey(record.supplier)}|${normalizeFuelTypeKey(record.fuelType)}`;
    const matchingRule =
      groupedRules
        .get(key)
        ?.find((rule) => rule.effectiveFrom <= record.date) ?? null;

    let status: FuelPriceValidationStatus = "SEM_PARAMETRO";
    let expectedPricePerLiter: number | null = null;
    let priceRuleEffectiveFrom: string | null = null;

    if (matchingRule) {
      expectedPricePerLiter = matchingRule.pricePerLiter;
      priceRuleEffectiveFrom = matchingRule.effectiveFrom;
      status =
        Math.abs(record.pricePerLiter - matchingRule.pricePerLiter) <= PRICE_TOLERANCE
          ? "CORRETO"
          : "DIVERGENTE";
    }

    return {
      ...record,
      priceValidationStatus: status,
      expectedPricePerLiter,
      priceRuleEffectiveFrom,
    };
  });
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
  options?: {
    message?: string;
    priceRules?: FuelPriceRule[];
  },
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
    message: options?.message,
    kpis: createKpis(records),
    records,
    priceRules: options?.priceRules ?? [],
    priceValidation: {
      validCount: records.filter((record) => record.priceValidationStatus === "CORRETO").length,
      divergentCount: records.filter((record) => record.priceValidationStatus === "DIVERGENTE").length,
      withoutRuleCount: records.filter((record) => record.priceValidationStatus !== "CORRETO" && record.priceValidationStatus !== "DIVERGENTE").length,
    },
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
    supplierOptions: Array.from(new Set(records.map((record) => record.supplier))).sort((a, b) =>
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
    {
      message:
        "Configure o DATABASE_URL do Neon para operar com persistencia real. Enquanto isso, o dashboard exibe dados demonstrativos.",
      priceRules: [],
    },
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

  const priceRules = await getFuelPriceRules();
  const records = applyPriceValidation(rows.map((row) => mapDbRowToFuelRecord(row)), priceRules);
  const filtered = applyClientSideFilters(records, filters);

  return buildDashboardSummaryFromRecords(filtered, "neon", {
    priceRules,
  });
}

export async function getAllFuelRecords(): Promise<FuelRecord[]> {
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
    order by data desc, horario desc nulls last, id desc
  `;

  const priceRules = await getFuelPriceRules();
  return applyPriceValidation(rows.map((row) => mapDbRowToFuelRecord(row)), priceRules);
}

export function applyFuelReportFilters(records: FuelRecord[], filters: FuelReportFilters): FuelRecord[] {
  return records.filter((record) => {
    if (filters.vehicle && filters.vehicle !== "todos" && record.vehicle !== filters.vehicle) {
      return false;
    }

    if (filters.supplier && filters.supplier !== "todos" && record.supplier !== filters.supplier) {
      return false;
    }

    if (filters.reportMonth && !record.date.startsWith(filters.reportMonth)) {
      return false;
    }

    if (filters.reportDay && record.date !== filters.reportDay) {
      return false;
    }

    return true;
  });
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
      replacedCount: 0,
      vehicleCount: 0,
      missingColumns: parsed.missingColumns,
      detectedFormat: parsed.detectedFormat,
      message: "Nenhum registro valido foi encontrado na planilha enviada.",
    };
  }

  const sql = getSqlClient();
  const deduplicatedMap = new Map<string, FuelRecord>();

  parsed.records.forEach((record) => {
    const duplicateKey = buildDuplicateKey({
      date: record.date,
      vehicle: getNormalizedVehicleValue(record) || record.vehicle,
      quantity: record.quantity,
      totalCost: record.totalCost,
    });

    deduplicatedMap.set(duplicateKey, record);
  });

  const deduplicatedRecords = Array.from(deduplicatedMap.values());
  const skippedCount = parsed.records.length - deduplicatedRecords.length;

  const dates = deduplicatedRecords.map((record) => record.date).filter(Boolean).sort();
  const startDate = dates[0];
  const endDate = dates[dates.length - 1];

  let replacedCount = 0;

  await sql.begin(async (transaction) => {
    if (startDate && endDate) {
      const existingRows = await transaction<FuelRowQuery[]>`
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
      `;

      const duplicateKeys = new Set(deduplicatedRecords.map((record) =>
        buildDuplicateKey({
          date: record.date,
          vehicle: getNormalizedVehicleValue(record) || record.vehicle,
          quantity: record.quantity,
          totalCost: record.totalCost,
        }),
      ));

      const idsToReplace = existingRows
        .filter((row) =>
          duplicateKeys.has(
            buildDuplicateKey({
              date: row.data,
              vehicle: row.veiculo ?? "",
              quantity: Number(row.quantidade ?? 0),
              totalCost: Number(row.custo_total ?? 0),
            }),
          ),
        )
        .map((row) => row.id)
        .filter((id): id is number => typeof id === "number");

      if (idsToReplace.length) {
        replacedCount = idsToReplace.length;
        await transaction`
          delete from abastecimentos
          where id in ${transaction(idsToReplace)}
        `;
      }
    }

    if (deduplicatedRecords.length) {
      await transaction`
        insert into abastecimentos ${transaction(
          deduplicatedRecords.map((record) => ({
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
  });

  return {
    insertedCount: deduplicatedRecords.length,
    skippedCount,
    replacedCount,
    vehicleCount: new Set(deduplicatedRecords.map((record) => record.vehicle)).size,
    missingColumns: parsed.missingColumns,
    detectedFormat: parsed.detectedFormat,
    message:
      replacedCount || skippedCount
        ? `${deduplicatedRecords.length} abastecimentos foram salvos, ${replacedCount} duplicados existentes foram substituidos e ${skippedCount} repeticoes internas foram ignoradas.`
        : `${deduplicatedRecords.length} abastecimentos foram salvos com sucesso.`,
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

export async function saveFuelPriceRule(input: {
  supplier: string;
  fuelType: string;
  pricePerLiter: number;
  effectiveFrom: string;
}) {
  if (!hasDatabaseConfig()) {
    throw new Error("DATABASE_URL nao configurado. Defina a conexao com o Neon antes de salvar parametros.");
  }

  const supplier = input.supplier.trim();
  const fuelType = input.fuelType.trim();
  const effectiveFrom = input.effectiveFrom.trim();
  const pricePerLiter = Number(input.pricePerLiter);

  if (!supplier || !fuelType || !effectiveFrom || !Number.isFinite(pricePerLiter) || pricePerLiter <= 0) {
    throw new Error("Preencha posto, combustivel, data de vigencia e valor do litro validos.");
  }

  await ensureFuelPriceRuleTable();

  const sql = getSqlClient();
  const rows = await sql<FuelPriceRuleQuery[]>`
    insert into parametros_preco_combustivel (
      fornecedor,
      fornecedor_chave,
      tipo_combustivel,
      tipo_combustivel_chave,
      valor_litro,
      vigencia_inicio
    ) values (
      ${supplier},
      ${normalizeSupplierKey(supplier)},
      ${fuelType},
      ${normalizeFuelTypeKey(fuelType)},
      ${pricePerLiter},
      ${effectiveFrom}
    )
    on conflict (fornecedor_chave, tipo_combustivel_chave, vigencia_inicio)
    do update set
      fornecedor = excluded.fornecedor,
      tipo_combustivel = excluded.tipo_combustivel,
      valor_litro = excluded.valor_litro
    returning
      id,
      fornecedor,
      fornecedor_chave,
      tipo_combustivel,
      tipo_combustivel_chave,
      valor_litro,
      vigencia_inicio::text as vigencia_inicio,
      criado_em::text as criado_em
  `;

  if (!rows[0]) {
    throw new Error("Nao foi possivel salvar o parametro de preco.");
  }

  return mapPriceRuleRow(rows[0]);
}
