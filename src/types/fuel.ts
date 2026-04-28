export type SourceFormat = "infleet" | "combustivel-fevereiro" | "desconhecido";

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
  raw: RawFuelRow;
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
  costByVehicle: NamedMetric[];
  litersByVehicle: NamedMetric[];
  monthlyCost: TimelineMetric[];
  monthlyLiters: TimelineMetric[];
  vehicleOptions: string[];
  fuelOptions: string[];
}

export interface UploadResult {
  insertedCount: number;
  skippedCount: number;
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
