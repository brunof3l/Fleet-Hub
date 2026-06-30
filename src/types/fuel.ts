export type SourceFormat = "infleet" | "combustivel-fevereiro" | "desconhecido";
export type FuelPriceValidationStatus = "CORRETO" | "DIVERGENTE" | "SEM_PARAMETRO";

export type RawFuelRow = Record<string, string | number | boolean | Date | null | undefined>;

export interface FuelRecord {
  id: string;
  date: string;
  time?: string;
  vehicle: string;
  licensePlate: string;
  model: string;
  supplier: string;
  fuelType: string;
  quantity: number;
  pricePerLiter: number;
  totalCost: number;
  odometer: number;
  autonomy: number;
  sourceFormat: SourceFormat;
  sourceFileName?: string;
  priceValidationStatus?: FuelPriceValidationStatus;
  expectedPricePerLiter?: number | null;
  priceRuleEffectiveFrom?: string | null;
  raw: RawFuelRow;
}

export interface FuelPriceRule {
  id: string;
  supplier: string;
  fuelType: string;
  pricePerLiter: number;
  effectiveFrom: string;
  createdAt?: string | null;
}

export interface FuelPriceValidationSummary {
  validCount: number;
  divergentCount: number;
  withoutRuleCount: number;
}

export interface FuelDbRecord {
  record_hash: string;
  occurred_at: string;
  vehicle_name: string;
  license_plate: string;
  vehicle_model: string;
  supplier_name: string;
  fuel_type: string;
  quantity_liters: number;
  unit_price_brl: number;
  total_cost_brl: number;
  distance_or_hours: number;
  autonomy_avg: number;
  source_format: SourceFormat;
  source_file_name: string;
  raw_payload: RawFuelRow;
  created_at: string;
}

export interface FuelInsertRecord {
  record_hash: string;
  occurred_at: string;
  vehicle_name: string;
  license_plate: string;
  vehicle_model: string;
  supplier_name: string;
  fuel_type: string;
  quantity_liters: number;
  unit_price_brl: number;
  total_cost_brl: number;
  distance_or_hours: number;
  autonomy_avg: number;
  source_format: SourceFormat;
  source_file_name: string;
  raw_payload: RawFuelRow;
}

export interface ReportLogRecord {
  report_month: string;
  period_start: string;
  period_end: string;
  file_name: string;
  status: "pending" | "sent" | "failed";
  sent_to: string;
  rows_count?: number;
  sent_at?: string | null;
  error_message?: string | null;
}

export interface HeaderMap {
  date?: string;
  time?: string;
  vehicle?: string;
  nickname?: string;
  quantity?: string;
  pricePerLiter?: string;
  totalCost?: string;
  odometer?: string;
  autonomy?: string;
  fuelType?: string;
  supplier?: string;
  model?: string;
  licensePlate?: string;
  measuredBy?: string;
  measurement?: string;
  createdBy?: string;
  notes?: string;
  inconsistencies?: string;
}

export interface ParseWorkbookResult {
  detectedFormat: SourceFormat;
  records: FuelRecord[];
  missingColumns: string[];
  sheetName: string;
}

export interface DashboardFilters {
  startDate: string;
  endDate: string;
  vehicle: string;
  fuelType: string;
  search: string;
}

export interface FuelReportFilters {
  vehicle: string;
  supplier: string;
  reportMonth: string;
  reportDay: string;
}

export interface DashboardKpis {
  totalCost: number;
  totalLiters: number;
  averagePrice: number;
  fleetAverageAutonomy: number;
  totalRecords: number;
}

export interface NamedMetric {
  label: string;
  value: number;
}

export interface TimelineMetric {
  date: string;
  value: number;
}

export interface DashboardSummary {
  source: "neon" | "demo" | "empty";
  message?: string;
  kpis: DashboardKpis;
  records: FuelRecord[];
  priceRules: FuelPriceRule[];
  priceValidation: FuelPriceValidationSummary;
  costByVehicle: NamedMetric[];
  litersByVehicle: NamedMetric[];
  monthlyCost: TimelineMetric[];
  monthlyLiters: TimelineMetric[];
  vehicleOptions: string[];
  fuelOptions: string[];
  supplierOptions: string[];
}

export interface UploadResult {
  insertedCount: number;
  skippedCount: number;
  replacedCount: number;
  vehicleCount: number;
  missingColumns: string[];
  detectedFormat: SourceFormat;
  message: string;
}

export interface MonthlyReportResult {
  reportMonth: string;
  fileName: string;
  sentTo: string;
  rows: number;
}

export interface CleanupResult {
  deletedFuelRows: number;
}

export interface InfleetFuelling {
  id: string;
  occurredAt: string;
  date: string;
  time: string;
  plate: string;
  rawPlate: string;
  vehicleName: string;
  liters: number;
  cost: number;
  unitPrice: number;
  fuelType: string;
  fuelTypeRaw: string;
  supplier: string;
  odometer: number;
  distanceKm: number;
  autonomy: number;
}

export interface InfleetSyncResult {
  inserted: number;
  updated: number;
  total: number;
  fromDate: string;
  toDate: string;
  message: string;
}

export type ConferenceStatus = "CONFORME" | "DIVERGENTE" | "NAO_LANCADO";

export interface FaturaHeader {
  supplier: string;
  invoiceNumber: string;
  issueDate: string;
  client: string;
}

export interface FaturaLine {
  documentNumber: string;
  date: string;
  rawDate: string;
  plate: string;
  rawPlate: string;
  quantity: number;
  odometerStart: number | null;
  odometerEnd: number | null;
  kmPerLiter: number | null;
  fuelType: string;
  pricePerLiter: number;
  totalCost: number;
}

export interface ParseFaturaResult {
  header: FaturaHeader;
  lines: FaturaLine[];
}

export interface ConferenceMatchedRecord {
  id: string;
  date: string;
  vehicle: string;
  quantity: number;
  pricePerLiter: number;
  totalCost: number;
}

export interface ConferenceMatchDetail {
  line: FaturaLine;
  status: ConferenceStatus;
  matchedRecord: ConferenceMatchedRecord | null;
  divergences: string[];
}

export interface InfleetOnlyRecord {
  id: string;
  date: string;
  vehicle: string;
  plate: string;
  supplier: string;
  quantity: number;
  totalCost: number;
}

export interface ConferenceResult {
  header: FaturaHeader;
  periodStart: string;
  periodEnd: string;
  totalLines: number;
  conformeCount: number;
  divergenteCount: number;
  naoLancadoCount: number;
  faturaTotalLiters: number;
  faturaTotalValue: number;
  matches: ConferenceMatchDetail[];
  infleetOnly: InfleetOnlyRecord[];
  message?: string;
}
