import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import * as XLSX from "xlsx";

import fleetSeedVehiclesJson from "@/data/fleet-vehicles.json";
import { hasDatabaseConfig } from "@/lib/env";
import { getSqlClient } from "@/lib/neon";
import type {
  FleetDocumentUploadResult,
  FleetImportResult,
  FleetLicensingAlert,
  FleetOverview,
  FleetSeedResult,
  FleetSeedVehicle,
  FleetVehicle,
} from "@/types/fleet";

type FleetVehicleRow = {
  id: number;
  placa: string;
  chassi: string;
  renavam: string;
  marca_modelo: string;
  ano_fabricacao_modelo: string;
  capacidade_litragem: number;
  local: string | null;
  tem_seguro: string | null;
  mes_vencimento_licenciamento: number;
  caminho_crlv_pdf: string | null;
  crlv_nome_arquivo: string | null;
  criado_em: string | null;
  atualizado_em: string | null;
};

type FleetImportRow = {
  plate: string;
  brandModel: string | null;
  manufacturingModelYear: string | null;
  location: string | null;
  insuranceStatus: string | null;
};

const fleetSeedVehicles = fleetSeedVehiclesJson as FleetSeedVehicle[];
const LICENSING_MONTH_LABELS: Record<number, string> = {
  6: "Junho",
  7: "Julho",
  8: "Agosto",
  9: "Setembro",
  10: "Outubro",
};
const CRLV_UPLOAD_DIRECTORY = path.join(process.cwd(), "public", "uploads", "crlv");
const CRLV_PUBLIC_PREFIX = "/uploads/crlv";
const DAY_IN_MS = 24 * 60 * 60 * 1000;
const FLEET_IMPORT_HEADER_ALIASES = {
  plate: ["placa", "placa veiculo", "placa do veiculo", "veiculo", "veículo", "frota"],
  brand: ["marca", "fabricante", "montadora"],
  model: ["modelo", "modelo veiculo", "modelo do veiculo", "descricao", "descrição"],
  year: ["ano", "ano modelo", "ano fabricacao/modelo", "ano fabricação/modelo", "fabricacao/modelo"],
  location: ["local", "cidade", "unidade", "origem", "base"],
  insurance: ["seguro", "tem seguro", "status seguro", "status do seguro", "cobertura"],
};

function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function normalizeNullableText(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized : null;
}

function normalizePlate(value: unknown): string {
  return String(value ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .trim();
}

function normalizeInsuranceStatus(value: unknown): string | null {
  const normalized = normalizeHeader(value).toUpperCase();

  if (!normalized) {
    return null;
  }

  if (["SIM", "S"].includes(normalized)) {
    return "SIM";
  }

  if (["NAO", "NÃO", "NAO POSSUI", "SEM SEGURO", "N"].includes(normalized)) {
    return "NAO";
  }

  if (normalized.includes("AGV")) {
    return "AGV";
  }

  if (normalized.includes("UNIQUE")) {
    return "UNIQUE";
  }

  return String(value ?? "").trim().toUpperCase();
}

function buildBrandModel(brand: unknown, model: unknown): string | null {
  const normalizedBrand = normalizeNullableText(brand);
  const normalizedModel = normalizeNullableText(model);

  if (normalizedBrand && normalizedModel) {
    const upperBrand = normalizedBrand.toUpperCase();
    const upperModel = normalizedModel.toUpperCase();

    if (upperModel.startsWith(`${upperBrand} `) || upperModel.startsWith(`${upperBrand}/`)) {
      return normalizedModel;
    }

    return `${normalizedBrand} / ${normalizedModel}`;
  }

  return normalizedBrand ?? normalizedModel ?? null;
}

function isValidImportedPlate(plate: string): boolean {
  return /^[A-Z0-9]{7}$/.test(plate);
}

function findColumnIndex(headers: unknown[], aliases: string[]): number {
  const normalizedAliases = new Set(aliases.map((alias) => normalizeHeader(alias)));

  return headers.findIndex((header) => normalizedAliases.has(normalizeHeader(header)));
}

function parseFleetImportRows(fileName: string, buffer: ArrayBuffer): {
  rows: FleetImportRow[];
  sheetsProcessed: string[];
} {
  const workbook = XLSX.read(Buffer.from(buffer), {
    type: "buffer",
    raw: false,
  });
  const mergedRows = new Map<string, FleetImportRow>();
  const sheetsProcessed: string[] = [];

  workbook.SheetNames.forEach((sheetName) => {
    const worksheet = workbook.Sheets[sheetName];

    if (!worksheet) {
      return;
    }

    const rows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
      header: 1,
      defval: "",
      blankrows: false,
      raw: false,
    });

    let headerRowIndex = -1;
    let plateColumnIndex = -1;
    let brandColumnIndex = -1;
    let modelColumnIndex = -1;
    let yearColumnIndex = -1;
    let locationColumnIndex = -1;
    let insuranceColumnIndex = -1;

    for (let index = 0; index < Math.min(rows.length, 15); index += 1) {
      const currentRow = rows[index] ?? [];
      const currentPlateIndex = findColumnIndex(currentRow, FLEET_IMPORT_HEADER_ALIASES.plate);
      const currentBrandIndex = findColumnIndex(currentRow, FLEET_IMPORT_HEADER_ALIASES.brand);
      const currentModelIndex = findColumnIndex(currentRow, FLEET_IMPORT_HEADER_ALIASES.model);
      const currentYearIndex = findColumnIndex(currentRow, FLEET_IMPORT_HEADER_ALIASES.year);
      const currentLocationIndex = findColumnIndex(currentRow, FLEET_IMPORT_HEADER_ALIASES.location);
      const currentInsuranceIndex = findColumnIndex(currentRow, FLEET_IMPORT_HEADER_ALIASES.insurance);

      if (
        currentPlateIndex >= 0 &&
        (
          currentBrandIndex >= 0 ||
          currentModelIndex >= 0 ||
          currentYearIndex >= 0 ||
          currentLocationIndex >= 0 ||
          currentInsuranceIndex >= 0
        )
      ) {
        headerRowIndex = index;
        plateColumnIndex = currentPlateIndex;
        brandColumnIndex = currentBrandIndex;
        modelColumnIndex = currentModelIndex;
        yearColumnIndex = currentYearIndex;
        locationColumnIndex = currentLocationIndex;
        insuranceColumnIndex = currentInsuranceIndex;
        break;
      }
    }

    if (headerRowIndex < 0 || plateColumnIndex < 0) {
      return;
    }

    sheetsProcessed.push(sheetName);

    rows.slice(headerRowIndex + 1).forEach((row) => {
      const plate = normalizePlate(row[plateColumnIndex]);

      if (!isValidImportedPlate(plate)) {
        return;
      }

      const current = mergedRows.get(plate);
      const brandModel = buildBrandModel(
        brandColumnIndex >= 0 ? row[brandColumnIndex] : null,
        modelColumnIndex >= 0 ? row[modelColumnIndex] : null,
      );
      const manufacturingModelYear =
        yearColumnIndex >= 0 ? normalizeNullableText(row[yearColumnIndex]) : null;
      const location = locationColumnIndex >= 0 ? normalizeNullableText(row[locationColumnIndex]) : null;
      const insuranceStatus =
        insuranceColumnIndex >= 0 ? normalizeInsuranceStatus(row[insuranceColumnIndex]) : null;

      mergedRows.set(plate, {
        plate,
        brandModel: brandModel ?? current?.brandModel ?? null,
        manufacturingModelYear: manufacturingModelYear ?? current?.manufacturingModelYear ?? null,
        location: location ?? current?.location ?? null,
        insuranceStatus: insuranceStatus ?? current?.insuranceStatus ?? null,
      });
    });
  });

  if (!sheetsProcessed.length) {
    throw new Error(
      `Nenhuma aba valida foi encontrada em ${fileName}. Confira se a planilha possui colunas como PLACA, MARCA, MODELO, LOCAL e SEGURO.`,
    );
  }

  return {
    rows: Array.from(mergedRows.values()),
    sheetsProcessed,
  };
}

function getPlaceholderValue(prefix: string, plate: string): string {
  return `${prefix}-${plate}`;
}

function getLicensingMonthByPlate(plate: string): number {
  const lastDigit = Number(plate.trim().slice(-1));

  if (!Number.isInteger(lastDigit) || lastDigit < 0 || lastDigit > 9) {
    throw new Error(`Placa invalida para calculo de vencimento: ${plate}.`);
  }

  if ([1, 2, 3].includes(lastDigit)) {
    return 6;
  }

  if ([4, 5, 6].includes(lastDigit)) {
    return 7;
  }

  if ([7, 8].includes(lastDigit)) {
    return 8;
  }

  if (lastDigit === 9) {
    return 9;
  }

  return 10;
}

function getLicensingMonthLabel(month: number): string {
  return LICENSING_MONTH_LABELS[month] ?? "Nao informado";
}

function createUtcDate(year: number, monthIndex: number, day: number): Date {
  return new Date(Date.UTC(year, monthIndex, day));
}

function getReferenceDate(referenceDate = new Date()): Date {
  return createUtcDate(
    referenceDate.getUTCFullYear(),
    referenceDate.getUTCMonth(),
    referenceDate.getUTCDate(),
  );
}

function getNextLicensingDueDate(month: number, referenceDate = new Date()): Date {
  const reference = getReferenceDate(referenceDate);
  let dueDate = createUtcDate(reference.getUTCFullYear(), month, 0);

  if (reference.getTime() > dueDate.getTime()) {
    dueDate = createUtcDate(reference.getUTCFullYear() + 1, month, 0);
  }

  return dueDate;
}

function formatDateToIso(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function getDaysUntilDate(targetDate: Date, referenceDate = new Date()): number {
  const reference = getReferenceDate(referenceDate);
  return Math.ceil((targetDate.getTime() - reference.getTime()) / DAY_IN_MS);
}

function mapRowToFleetVehicle(row: FleetVehicleRow, referenceDate = new Date()): FleetVehicle {
  const licensingDueDate = getNextLicensingDueDate(row.mes_vencimento_licenciamento, referenceDate);
  const daysUntilLicensing = getDaysUntilDate(licensingDueDate, referenceDate);

  return {
    id: String(row.id),
    plate: row.placa,
    chassis: row.chassi,
    renavam: row.renavam,
    brandModel: row.marca_modelo,
    manufacturingModelYear: row.ano_fabricacao_modelo,
    location: row.local,
    insuranceStatus: row.tem_seguro,
    tankCapacityLiters: Number(row.capacidade_litragem ?? 0),
    licensingDueMonth: Number(row.mes_vencimento_licenciamento ?? 0),
    licensingDueMonthLabel: getLicensingMonthLabel(Number(row.mes_vencimento_licenciamento ?? 0)),
    licensingDueDate: formatDateToIso(licensingDueDate),
    daysUntilLicensing,
    isLicensingDueSoon: daysUntilLicensing >= 0 && daysUntilLicensing <= 30,
    crlvPdfPath: row.caminho_crlv_pdf,
    crlvFileName: row.crlv_nome_arquivo,
    hasCrlv: Boolean(row.caminho_crlv_pdf),
    createdAt: row.criado_em,
    updatedAt: row.atualizado_em,
  };
}

function buildFleetOverview(vehicles: FleetVehicle[], message?: string): FleetOverview {
  const alerts: FleetLicensingAlert[] = vehicles
    .filter((vehicle) => vehicle.isLicensingDueSoon)
    .sort((left, right) => left.daysUntilLicensing - right.daysUntilLicensing)
    .map((vehicle) => ({
      vehicleId: vehicle.id,
      plate: vehicle.plate,
      brandModel: vehicle.brandModel,
      licensingDueDate: vehicle.licensingDueDate,
      licensingDueMonthLabel: vehicle.licensingDueMonthLabel,
      daysUntilLicensing: vehicle.daysUntilLicensing,
    }));

  const locationOptions = Array.from(
    new Set(vehicles.map((vehicle) => vehicle.location).filter((location): location is string => Boolean(location))),
  ).sort((left, right) => left.localeCompare(right));

  return {
    source: "neon",
    message,
    totalVehicles: vehicles.length,
    withCrlvCount: vehicles.filter((vehicle) => vehicle.hasCrlv).length,
    withoutCrlvCount: vehicles.filter((vehicle) => !vehicle.hasCrlv).length,
    zeroTankCapacityCount: vehicles.filter((vehicle) => vehicle.tankCapacityLiters === 0).length,
    alerts,
    vehicles,
    vehicleOptions: vehicles.map((vehicle) => vehicle.plate),
    locationOptions,
  };
}

function sanitizeFileName(fileName: string): string {
  const extension = path.extname(fileName).toLowerCase();
  const baseName = path.basename(fileName, extension).replace(/[^a-zA-Z0-9-_]+/g, "-");
  const safeBaseName = baseName.replace(/-+/g, "-").replace(/^-|-$/g, "") || "crlv";
  return `${safeBaseName}${extension || ".pdf"}`;
}

function getAbsoluteFilePathFromPublicPath(publicPath: string): string {
  const relativePath = publicPath.replace(/^\//, "").split("/").join(path.sep);
  return path.join(process.cwd(), "public", relativePath);
}

function assertValidVehicleId(vehicleId: string): number {
  const parsedVehicleId = Number(vehicleId);

  if (!Number.isInteger(parsedVehicleId) || parsedVehicleId <= 0) {
    throw new Error("Veiculo de frota invalido.");
  }

  return parsedVehicleId;
}

async function getFleetVehicleRowById(vehicleId: number): Promise<FleetVehicleRow | null> {
  const sql = getSqlClient();
  const rows = await sql<FleetVehicleRow[]>`
    select
      id,
      placa,
      chassi,
      renavam,
      marca_modelo,
      ano_fabricacao_modelo,
      capacidade_litragem,
      local,
      tem_seguro,
      mes_vencimento_licenciamento,
      caminho_crlv_pdf,
      crlv_nome_arquivo,
      criado_em::text as criado_em,
      atualizado_em::text as atualizado_em
    from frota_veiculos
    where id = ${vehicleId}
    limit 1
  `;

  return rows[0] ?? null;
}

export async function ensureFleetVehicleTable() {
  if (!hasDatabaseConfig()) {
    return;
  }

  const sql = getSqlClient();

  await sql`
    create table if not exists frota_veiculos (
      id bigserial primary key,
      placa text not null,
      chassi text not null,
      renavam text not null,
      marca_modelo text not null,
      ano_fabricacao_modelo text not null,
      capacidade_litragem numeric(10,2) not null default 0,
      local text,
      tem_seguro text,
      mes_vencimento_licenciamento smallint not null,
      caminho_crlv_pdf text,
      crlv_nome_arquivo text,
      criado_em timestamptz not null default now(),
      atualizado_em timestamptz not null default now(),
      constraint ck_frota_veiculos_capacidade_litragem check (capacidade_litragem >= 0),
      constraint ck_frota_veiculos_mes_vencimento check (mes_vencimento_licenciamento between 1 and 12)
    )
  `;

  await sql`
    alter table frota_veiculos
    add column if not exists local text
  `;

  await sql`
    alter table frota_veiculos
    add column if not exists tem_seguro text
  `;

  await sql`
    create unique index if not exists ux_frota_veiculos_placa
    on frota_veiculos (placa)
  `;

  await sql`
    create unique index if not exists ux_frota_veiculos_chassi
    on frota_veiculos (chassi)
  `;

  await sql`
    create unique index if not exists ux_frota_veiculos_renavam
    on frota_veiculos (renavam)
  `;
}

export async function getFleetOverview(): Promise<FleetOverview> {
  if (!hasDatabaseConfig()) {
    return {
      source: "empty",
      message: "DATABASE_URL nao configurado. Defina a conexao com o Neon para operar a gestao de frota.",
      totalVehicles: 0,
      withCrlvCount: 0,
      withoutCrlvCount: 0,
      zeroTankCapacityCount: 0,
      alerts: [],
      vehicles: [],
      vehicleOptions: [],
      locationOptions: [],
    };
  }

  await ensureFleetVehicleTable();

  const sql = getSqlClient();
  const rows = await sql<FleetVehicleRow[]>`
    select
      id,
      placa,
      chassi,
      renavam,
      marca_modelo,
      ano_fabricacao_modelo,
      capacidade_litragem,
      local,
      tem_seguro,
      mes_vencimento_licenciamento,
      caminho_crlv_pdf,
      crlv_nome_arquivo,
      criado_em::text as criado_em,
      atualizado_em::text as atualizado_em
    from frota_veiculos
    order by placa asc
  `;
  const vehicles = rows.map((row) => mapRowToFleetVehicle(row));
  const message = vehicles.length
    ? undefined
    : "A tabela de frota esta pronta, mas ainda nao recebeu a carga inicial dos CRLVs.";

  return buildFleetOverview(vehicles, message);
}

export async function getFleetVehicleById(vehicleId: string): Promise<FleetVehicle> {
  if (!hasDatabaseConfig()) {
    throw new Error("DATABASE_URL nao configurado. Defina a conexao com o Neon antes de consultar a frota.");
  }

  await ensureFleetVehicleTable();

  const parsedVehicleId = assertValidVehicleId(vehicleId);
  const row = await getFleetVehicleRowById(parsedVehicleId);

  if (!row) {
    throw new Error("Veiculo da frota nao encontrado.");
  }

  return mapRowToFleetVehicle(row);
}

export async function seedFleetVehicles(): Promise<FleetSeedResult> {
  if (!hasDatabaseConfig()) {
    throw new Error("DATABASE_URL nao configurado. Defina a conexao com o Neon antes de executar a seed.");
  }

  await ensureFleetVehicleTable();

  const sql = getSqlClient();
  const seedPlates = fleetSeedVehicles.map((vehicle) => vehicle.placa);
  const existingRows = await sql<{ placa: string }[]>`
    select placa
    from frota_veiculos
    where placa in ${sql(seedPlates)}
  `;
  const existingPlateSet = new Set(existingRows.map((row) => row.placa));

  await sql.begin(async (transaction) => {
    await transaction`
      insert into frota_veiculos ${transaction(
        fleetSeedVehicles.map((vehicle) => ({
          placa: vehicle.placa,
          chassi: vehicle.chassi,
          renavam: vehicle.renavam,
          marca_modelo: vehicle.marca_modelo,
          ano_fabricacao_modelo: vehicle.ano_fabricacao_modelo,
          capacidade_litragem: vehicle.capacidade_litragem,
          mes_vencimento_licenciamento: getLicensingMonthByPlate(vehicle.placa),
        })),
        "placa",
        "chassi",
        "renavam",
        "marca_modelo",
        "ano_fabricacao_modelo",
        "capacidade_litragem",
        "mes_vencimento_licenciamento",
      )}
      on conflict (placa) do update
      set
        chassi = excluded.chassi,
        renavam = excluded.renavam,
        marca_modelo = excluded.marca_modelo,
        ano_fabricacao_modelo = excluded.ano_fabricacao_modelo,
        capacidade_litragem = excluded.capacidade_litragem,
        mes_vencimento_licenciamento = excluded.mes_vencimento_licenciamento,
        atualizado_em = now()
    `;
  });

  const insertedCount = fleetSeedVehicles.length - existingPlateSet.size;
  const updatedCount = existingPlateSet.size;

  return {
    insertedCount,
    updatedCount,
    totalCount: fleetSeedVehicles.length,
    message:
      updatedCount > 0
        ? `Seed concluida com ${insertedCount} inclusoes e ${updatedCount} atualizacoes na frota.`
        : `Seed concluida com ${insertedCount} veiculos inseridos na frota.`,
  };
}

export async function importFleetSpreadsheet(
  fileName: string,
  buffer: ArrayBuffer,
): Promise<FleetImportResult> {
  if (!hasDatabaseConfig()) {
    throw new Error("DATABASE_URL nao configurado. Defina a conexao com o Neon antes de importar a planilha.");
  }

  await ensureFleetVehicleTable();

  const parsed = parseFleetImportRows(fileName, buffer);

  if (!parsed.rows.length) {
    return {
      insertedCount: 0,
      skippedCount: 0,
      updatedCount: 0,
      processedRows: 0,
      sheetsProcessed: parsed.sheetsProcessed,
      message: "Nenhum veiculo valido foi encontrado na planilha enviada.",
    };
  }

  const sql = getSqlClient();
  const importedPlates = parsed.rows.map((row) => row.plate);
  const existingRows = await sql<{
    id: number;
    placa: string;
    marca_modelo: string | null;
    ano_fabricacao_modelo: string | null;
    local: string | null;
    tem_seguro: string | null;
  }[]>`
    select
      id,
      placa,
      marca_modelo,
      ano_fabricacao_modelo,
      local,
      tem_seguro
    from frota_veiculos
    where placa in ${sql(importedPlates)}
  `;
  const existingMap = new Map(existingRows.map((row) => [row.placa, row]));
  let insertedCount = 0;
  let skippedCount = 0;
  let updatedCount = 0;

  await sql.begin(async (transaction) => {
    for (const row of parsed.rows) {
      const existing = existingMap.get(row.plate);

      if (existing) {
        skippedCount += 1;

        const nextLocation = row.location ?? existing.local;
        const nextInsuranceStatus = row.insuranceStatus ?? existing.tem_seguro;
        const nextBrandModel = row.brandModel ?? existing.marca_modelo;
        const nextManufacturingModelYear =
          row.manufacturingModelYear ?? existing.ano_fabricacao_modelo;
        const hasLocationChange = nextLocation !== existing.local;
        const hasInsuranceChange = nextInsuranceStatus !== existing.tem_seguro;
        const hasBrandModelChange = nextBrandModel !== existing.marca_modelo;
        const hasManufacturingModelYearChange =
          nextManufacturingModelYear !== existing.ano_fabricacao_modelo;

        if (
          hasLocationChange ||
          hasInsuranceChange ||
          hasBrandModelChange ||
          hasManufacturingModelYearChange
        ) {
          await transaction`
            update frota_veiculos
            set
              marca_modelo = ${nextBrandModel},
              ano_fabricacao_modelo = ${nextManufacturingModelYear},
              local = ${nextLocation},
              tem_seguro = ${nextInsuranceStatus},
              atualizado_em = now()
            where id = ${existing.id}
          `;
          updatedCount += 1;
        }

        continue;
      }

      await transaction`
        insert into frota_veiculos (
          placa,
          chassi,
          renavam,
          marca_modelo,
          ano_fabricacao_modelo,
          capacidade_litragem,
          local,
          tem_seguro,
          mes_vencimento_licenciamento
        ) values (
          ${row.plate},
          ${getPlaceholderValue("CHASSI-PENDENTE", row.plate)},
          ${getPlaceholderValue("RENAVAM-PENDENTE", row.plate)},
          ${row.brandModel ?? "NAO INFORMADO"},
          ${row.manufacturingModelYear ?? "NAO INFORMADO"},
          ${0},
          ${row.location},
          ${row.insuranceStatus},
          ${getLicensingMonthByPlate(row.plate)}
        )
      `;

      insertedCount += 1;
    }
  });

  const updateMessage =
    updatedCount > 0
      ? ` ${updatedCount} registros duplicados tiveram local e/ou seguro atualizados.`
      : "";

  return {
    insertedCount,
    skippedCount,
    updatedCount,
    processedRows: parsed.rows.length,
    sheetsProcessed: parsed.sheetsProcessed,
    message: `${insertedCount} novos veiculos importados com sucesso. ${skippedCount} veiculos ignorados por ja estarem cadastrados.${updateMessage}`,
  };
}

export async function saveFleetVehicleCrlv(
  vehicleId: string,
  file: File,
): Promise<FleetDocumentUploadResult> {
  if (!hasDatabaseConfig()) {
    throw new Error("DATABASE_URL nao configurado. Defina a conexao com o Neon antes de anexar CRLVs.");
  }

  if (file.type && file.type !== "application/pdf") {
    throw new Error("Envie um arquivo PDF valido para o CRLV.");
  }

  await ensureFleetVehicleTable();

  const parsedVehicleId = assertValidVehicleId(vehicleId);
  const currentVehicle = await getFleetVehicleRowById(parsedVehicleId);

  if (!currentVehicle) {
    throw new Error("Veiculo da frota nao encontrado para anexar o CRLV.");
  }

  await mkdir(CRLV_UPLOAD_DIRECTORY, { recursive: true });

  const sanitizedOriginalName = sanitizeFileName(file.name);
  const storedFileName = `${currentVehicle.placa}-${Date.now()}-${sanitizedOriginalName}`;
  const publicPath = `${CRLV_PUBLIC_PREFIX}/${storedFileName}`;
  const absolutePath = path.join(CRLV_UPLOAD_DIRECTORY, storedFileName);
  const buffer = Buffer.from(await file.arrayBuffer());

  await writeFile(absolutePath, buffer);

  if (currentVehicle.caminho_crlv_pdf && currentVehicle.caminho_crlv_pdf.startsWith(CRLV_PUBLIC_PREFIX)) {
    const previousAbsolutePath = getAbsoluteFilePathFromPublicPath(currentVehicle.caminho_crlv_pdf);

    if (previousAbsolutePath !== absolutePath) {
      await unlink(previousAbsolutePath).catch(() => undefined);
    }
  }

  const sql = getSqlClient();
  await sql`
    update frota_veiculos
    set
      caminho_crlv_pdf = ${publicPath},
      crlv_nome_arquivo = ${file.name},
      atualizado_em = now()
    where id = ${parsedVehicleId}
  `;

  const updatedVehicle = await getFleetVehicleById(vehicleId);

  return {
    vehicle: updatedVehicle,
    message: `CRLV de ${updatedVehicle.plate} enviado com sucesso.`,
  };
}

export async function getFleetVehicleCrlvDownload(vehicleId: string) {
  if (!hasDatabaseConfig()) {
    throw new Error("DATABASE_URL nao configurado. Defina a conexao com o Neon antes de baixar CRLVs.");
  }

  await ensureFleetVehicleTable();

  const vehicle = await getFleetVehicleById(vehicleId);

  if (!vehicle.crlvPdfPath) {
    throw new Error("Este veiculo ainda nao possui CRLV anexado.");
  }

  const fileBuffer = await readFile(getAbsoluteFilePathFromPublicPath(vehicle.crlvPdfPath));
  const downloadName = vehicle.crlvFileName || `${vehicle.plate}-crlv.pdf`;

  return {
    fileBuffer,
    downloadName,
    contentType: "application/pdf",
  };
}
