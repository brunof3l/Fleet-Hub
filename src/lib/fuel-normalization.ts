import * as XLSX from "xlsx";

import type {
  FuelInsertRecord,
  FuelDbRecord,
  FuelRecord,
  HeaderMap,
  ParseWorkbookResult,
  RawFuelRow,
  SourceFormat,
} from "@/types/fuel";

const REQUIRED_FIELDS: Array<keyof HeaderMap> = [
  "date",
  "vehicle",
  "quantity",
  "pricePerLiter",
  "totalCost",
  "odometer",
  "autonomy",
];

const COLUMN_ALIASES: Record<keyof HeaderMap, string[]> = {
  date: ["data", "data do abastecimento", "dt abastecimento", "dt. abastecimento"],
  time: ["horario", "horário", "hora", "hora do abastecimento"],
  vehicle: ["veiculo", "veículo", "placa/veiculo", "placa/veículo", "placa", "frota"],
  nickname: ["apelido", "nome fantasia do veiculo", "nome fantasia do veículo", "nome do veiculo"],
  quantity: ["quantidade", "litros", "qtd litros", "volume abastecido", "volume"],
  pricePerLiter: [
    "valor do litro (r$/l)",
    "valor do litro",
    "preco litro",
    "preço litro",
    "valor litro",
    "r$/l",
  ],
  totalCost: ["custo total (r$)", "valor total", "total", "custo total", "valor abastecimento"],
  odometer: [
    "medida percorrida (km ou h)",
    "medida percorrida",
    "km rodados",
    "quilometragem",
    "odometro",
    "odômetro",
    "hodometro",
    "horimetro",
    "hodômetro",
  ],
  autonomy: [
    "autonomia media (km/l ou l/h)",
    "autonomia média (km/l ou l/h)",
    "autonomia media",
    "autonomia média",
    "consumo medio",
    "consumo médio",
  ],
  fuelType: ["tipo de combustivel", "tipo de combustível", "combustivel", "combustível", "produto"],
  supplier: [
    "fornecedor/estabelecimento",
    "fornecedor",
    "estabelecimento",
    "posto",
    "rede",
  ],
  model: ["modelo", "modelo do veiculo", "modelo do veículo", "descricao do veiculo"],
  licensePlate: ["placa", "placa do veiculo", "placa do veículo"],
  measuredBy: ["medido por"],
  measurement: ["medicao", "medição"],
  createdBy: ["criado por"],
  notes: ["observacoes", "observações", "obs"],
  inconsistencies: ["inconsistencias", "inconsistências"],
};

const FORMAT_HINTS: Record<Exclude<SourceFormat, "desconhecido">, string[]> = {
  infleet: [
    "tipo de combustivel",
    "tipo de combustível",
    "fornecedor/estabelecimento",
    "valor do litro (r$/l)",
    "medida percorrida (km ou h)",
  ],
  "combustivel-fevereiro": [
    "posto",
    "valor litro",
    "km rodados",
    "autonomia média",
    "placa",
  ],
};

const DEMO_CSV = `Data,Veículo,Placa,Modelo,Fornecedor/Estabelecimento,Tipo de Combustível,Quantidade,Valor do litro (R$/l),Custo total (R$),Medida percorrida (km ou H),Autonomia média (km/l ou l/h)
2026-02-01,Caminhão 101,ABC1D23,Volvo FH,Posto Atlântico,S10,250,6.19,1547.5,1320,5.28
2026-02-03,Van 08,EFG4H56,Mercedes Sprinter,Posto Premium,Diesel,78,6.09,475.02,812,10.41
2026-02-04,Gerador Norte,IJK7L89,Gerador 200kVA,Fornec Energia,Diesel,120,5.98,717.6,46,2.61
2026-02-06,Picape 14,MNO0P12,Toyota Hilux,Posto Premium,Gasolina,65,5.89,382.85,690,10.62
2026-02-09,Caminhão 101,ABC1D23,Volvo FH,Posto Atlântico,S10,240,6.27,1504.8,1265,5.27
2026-02-10,Van 08,EFG4H56,Mercedes Sprinter,Posto Cidade,Diesel,82,6.11,501.02,856,10.44
2026-02-12,Picape 14,MNO0P12,Toyota Hilux,Posto Cidade,Gasolina,70,5.95,416.5,734,10.49
2026-02-14,Gerador Norte,IJK7L89,Gerador 200kVA,Fornec Energia,Diesel,115,6.02,692.3,44,2.61`;

function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function parseNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (value instanceof Date) {
    return Number.NaN;
  }

  const text = String(value ?? "").trim();
  if (!text) {
    return 0;
  }

  const cleaned = text
    .replace(/[R$\s]/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".")
    .replace(/[^0-9.-]/g, "");

  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseDate(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      const date = new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d));
      return date.toISOString().slice(0, 10);
    }
  }

  const text = String(value ?? "").trim();
  if (!text) {
    return "";
  }

  const normalized = text.replace(/\s+\d{1,2}:\d{2}(:\d{2})?$/, "");
  const brMatch = normalized.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (brMatch) {
    let [, day, month, year] = brMatch;

    if (year.length === 2) {
      year = `20${year}`;
    }

    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const isoMatch = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const iso = new Date(normalized);
  if (!Number.isNaN(iso.getTime())) {
    return iso.toISOString().slice(0, 10);
  }

  return "";
}

function parseTime(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(11, 19);
  }

  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      const hours = String(parsed.H ?? parsed.h ?? 0).padStart(2, "0");
      const minutes = String(parsed.M ?? parsed.m ?? 0).padStart(2, "0");
      const seconds = String(parsed.S ?? parsed.s ?? 0).padStart(2, "0");
      return `${hours}:${minutes}:${seconds}`;
    }
  }

  const text = String(value ?? "").trim();
  if (!text) {
    return "";
  }

  const shortMatch = text.match(/^(\d{1,2}):(\d{2})$/);
  if (shortMatch) {
    const [, hours, minutes] = shortMatch;
    return `${hours.padStart(2, "0")}:${minutes}:00`;
  }

  const fullMatch = text.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (fullMatch) {
    const [, hours, minutes, seconds = "00"] = fullMatch;
    return `${hours.padStart(2, "0")}:${minutes}:${seconds}`;
  }

  return "";
}

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function pickColumn(headers: string[], aliases: string[]): string | undefined {
  const normalizedAliases = aliases.map((alias) => normalizeHeader(alias));
  return headers.find((header) => {
    const normalizedHeader = normalizeHeader(header);
    return normalizedAliases.some(
      (alias) => normalizedHeader === alias || normalizedHeader.includes(alias),
    );
  });
}

function buildHeaderMap(headers: string[]): HeaderMap {
  return {
    date: pickColumn(headers, COLUMN_ALIASES.date),
    time: pickColumn(headers, COLUMN_ALIASES.time),
    vehicle: pickColumn(headers, COLUMN_ALIASES.vehicle),
    nickname: pickColumn(headers, COLUMN_ALIASES.nickname),
    quantity: pickColumn(headers, COLUMN_ALIASES.quantity),
    pricePerLiter: pickColumn(headers, COLUMN_ALIASES.pricePerLiter),
    totalCost: pickColumn(headers, COLUMN_ALIASES.totalCost),
    odometer: pickColumn(headers, COLUMN_ALIASES.odometer),
    autonomy: pickColumn(headers, COLUMN_ALIASES.autonomy),
    fuelType: pickColumn(headers, COLUMN_ALIASES.fuelType),
    supplier: pickColumn(headers, COLUMN_ALIASES.supplier),
    model: pickColumn(headers, COLUMN_ALIASES.model),
    licensePlate: pickColumn(headers, COLUMN_ALIASES.licensePlate),
    measuredBy: pickColumn(headers, COLUMN_ALIASES.measuredBy),
    measurement: pickColumn(headers, COLUMN_ALIASES.measurement),
    createdBy: pickColumn(headers, COLUMN_ALIASES.createdBy),
    notes: pickColumn(headers, COLUMN_ALIASES.notes),
    inconsistencies: pickColumn(headers, COLUMN_ALIASES.inconsistencies),
  };
}

function detectSourceFormat(fileName: string, headers: string[]): SourceFormat {
  const normalizedFileName = normalizeHeader(fileName);

  if (normalizedFileName.includes("infleet")) {
    return "infleet";
  }

  if (normalizedFileName.includes("combustivel fevereiro")) {
    return "combustivel-fevereiro";
  }

  let bestMatch: SourceFormat = "desconhecido";
  let highestScore = 0;

  (Object.entries(FORMAT_HINTS) as Array<[Exclude<SourceFormat, "desconhecido">, string[]]>).forEach(
    ([format, aliases]) => {
      const score = aliases.filter((alias) =>
        headers.some((header) => normalizeHeader(header).includes(normalizeHeader(alias))),
      ).length;

      if (score > highestScore) {
        highestScore = score;
        bestMatch = format;
      }
    },
  );

  return bestMatch;
}

function inferModel(vehicle: string, fallback: unknown): string {
  const text = String(fallback ?? "").trim();
  if (text) {
    return text;
  }

  const parts = vehicle.split("-");
  return parts.length > 1 ? parts[0].trim() : vehicle;
}

function inferPlate(vehicle: string, fallback: unknown): string {
  const text = String(fallback ?? "").trim();
  if (text) {
    return text.toUpperCase();
  }

  const plateMatch = vehicle.match(/[A-Z]{3}[0-9][A-Z0-9][0-9]{2}/i);
  return plateMatch ? plateMatch[0].toUpperCase() : "";
}

function buildVehicleName(row: RawFuelRow, headerMap: HeaderMap, index: number): string {
  const vehicleValue = String(headerMap.vehicle ? row[headerMap.vehicle] : "").trim();
  return vehicleValue || `Registro ${index + 1}`;
}

function cleanRows(rows: RawFuelRow[]): RawFuelRow[] {
  return rows.filter((row) =>
    Object.values(row).some((value) => String(value ?? "").trim() !== ""),
  );
}

function mapRowToRecord(
  row: RawFuelRow,
  headerMap: HeaderMap,
  sourceFormat: SourceFormat,
  index: number,
  sourceFileName: string,
): FuelRecord {
  const date = parseDate(headerMap.date ? row[headerMap.date] : "");
  const time = parseTime(headerMap.time ? row[headerMap.time] : "");
  const vehicle = buildVehicleName(row, headerMap, index);
  const fuelType = String(headerMap.fuelType ? row[headerMap.fuelType] : "Nao informado").trim();
  const supplier = String(headerMap.supplier ? row[headerMap.supplier] : "Nao informado").trim();
  const model = inferModel(vehicle, headerMap.model ? row[headerMap.model] : "");
  const licensePlateSource = headerMap.licensePlate
    ? row[headerMap.licensePlate]
    : headerMap.vehicle
      ? row[headerMap.vehicle]
      : "";
  const licensePlate = inferPlate(vehicle, licensePlateSource);

  return {
    id: `${date || "sem-data"}-${slugify(vehicle || `registro-${index + 1}`)}-${index}`,
    date,
    time,
    vehicle: vehicle || `Registro ${index + 1}`,
    licensePlate,
    model,
    supplier: supplier || "Nao informado",
    fuelType: fuelType || "Nao informado",
    quantity: parseNumber(headerMap.quantity ? row[headerMap.quantity] : 0),
    pricePerLiter: parseNumber(headerMap.pricePerLiter ? row[headerMap.pricePerLiter] : 0),
    totalCost: parseNumber(headerMap.totalCost ? row[headerMap.totalCost] : 0),
    odometer: parseNumber(headerMap.odometer ? row[headerMap.odometer] : 0),
    autonomy: parseNumber(headerMap.autonomy ? row[headerMap.autonomy] : 0),
    sourceFormat,
    sourceFileName,
    raw: row,
  };
}

export function parseWorkbook(fileName: string, buffer: ArrayBuffer): ParseWorkbookResult {
  const workbook = XLSX.read(buffer, {
    type: "array",
    cellDates: true,
    raw: true,
  });

  const sheetName = workbook.SheetNames[0] ?? "Planilha 1";
  const sheet = workbook.Sheets[sheetName];

  if (!sheet) {
    return {
      detectedFormat: "desconhecido",
      records: [],
      missingColumns: REQUIRED_FIELDS,
      sheetName,
    };
  }

  const rows = cleanRows(
    XLSX.utils.sheet_to_json<RawFuelRow>(sheet, {
      defval: "",
      raw: true,
    }),
  );
  const headers = rows[0] ? Object.keys(rows[0]) : [];
  const headerMap = buildHeaderMap(headers);
  const detectedFormat = detectSourceFormat(fileName, headers);
  const missingColumns = REQUIRED_FIELDS.filter((field) => !headerMap[field]);
  const records = rows
    .map((row, index) => mapRowToRecord(row, headerMap, detectedFormat, index, fileName))
    .filter((record) => record.date && record.vehicle);

  return {
    detectedFormat,
    records,
    missingColumns,
    sheetName,
  };
}

export function recordsToDb(records: FuelRecord[]): FuelDbRecord[] {
  const createdAt = new Date().toISOString();

  return records.map((record) => ({
    record_hash: createRecordHash(record),
    occurred_at: record.date,
    vehicle_name: record.vehicle,
    license_plate: record.licensePlate,
    vehicle_model: record.model,
    supplier_name: record.supplier,
    fuel_type: record.fuelType,
    quantity_liters: record.quantity,
    unit_price_brl: record.pricePerLiter,
    total_cost_brl: record.totalCost,
    distance_or_hours: record.odometer,
    autonomy_avg: record.autonomy,
    source_format: record.sourceFormat,
    source_file_name: record.sourceFileName ?? "upload.xlsx",
    raw_payload: record.raw,
    created_at: createdAt,
  }));
}

export function createRecordHash(record: FuelRecord): string {
  const canonical = [
    record.date,
    record.time ?? "",
    record.vehicle,
    record.licensePlate,
    record.model,
    record.supplier,
    record.fuelType,
    record.quantity.toFixed(3),
    record.pricePerLiter.toFixed(3),
    record.totalCost.toFixed(3),
    record.odometer.toFixed(3),
    record.autonomy.toFixed(3),
    record.sourceFormat,
  ].join("|");

  let hash = 2166136261;
  for (let index = 0; index < canonical.length; index += 1) {
    hash ^= canonical.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return `rec_${Math.abs(hash >>> 0).toString(16)}_${canonical.length}`;
}

export function recordsToInsertPayload(records: FuelRecord[]): FuelInsertRecord[] {
  return records.map((record) => ({
    record_hash: createRecordHash(record),
    occurred_at: record.date,
    vehicle_name: record.vehicle,
    license_plate: record.licensePlate,
    vehicle_model: record.model,
    supplier_name: record.supplier,
    fuel_type: record.fuelType,
    quantity_liters: record.quantity,
    unit_price_brl: record.pricePerLiter,
    total_cost_brl: record.totalCost,
    distance_or_hours: record.odometer,
    autonomy_avg: record.autonomy,
    source_format: record.sourceFormat,
    source_file_name: record.sourceFileName ?? "upload.xlsx",
    raw_payload: record.raw,
  }));
}

export function getDemoRecords(): FuelRecord[] {
  const workbook = XLSX.read(DEMO_CSV, { type: "string" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = cleanRows(XLSX.utils.sheet_to_json<RawFuelRow>(sheet, { defval: "" }));
  const headers = rows[0] ? Object.keys(rows[0]) : [];
  const headerMap = buildHeaderMap(headers);

  return rows.map((row, index) => mapRowToRecord(row, headerMap, "infleet", index, "dados-demo.csv"));
}
