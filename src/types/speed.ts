export type SpeedCellValue = string | number | boolean | Date | null | undefined;

export type SpeedSheetRow = Record<string, SpeedCellValue>;

export interface SpeedViolation {
  vehicle: string;
  driver: string;
  address: string;
  startDate: Date;
  startLabel: string;
  endDate: Date;
  endLabel: string;
  durationMinutes: string;
  maxSpeed: number;
  location?: string | null;
  prefix?: string | null;
}

export interface SpeedColumnMap {
  date: string;
  vehicle: string;
  speed: string;
  time?: string;
  driver?: string;
  address?: string;
}

export interface SpeedReportEntry {
  date: Date;
  dateLabel: string;
  vehicle: string;
  speed: number;
  driver: string;
  address: string;
}

export interface SpeedBlock {
  vehicle: string;
  driver: string;
  address: string;
  startDate: Date;
  startLabel: string;
  endDate: Date;
  endLabel: string;
  maxSpeed: number;
}

export interface SpeedAnalysisResult {
  violations: SpeedViolation[];
  sheetName: string | null;
  fileName: string;
  error?: string;
}

export interface SpeedDashboardTopOffender {
  vehicle: string;
  location: string | null;
  count: number;
}

export interface SpeedDashboardLocationMetric {
  location: string;
  count: number;
}

export interface SpeedDashboardSummary {
  totalAlertsCurrentMonth: number;
  highestSpeed: number;
  highestSpeedVehicle: string | null;
  highestSpeedLocation: string | null;
  topLocation: string | null;
  topLocationCount: number;
}

export interface SpeedDashboardData {
  summary: SpeedDashboardSummary;
  topOffenders: SpeedDashboardTopOffender[];
  violationsByLocation: SpeedDashboardLocationMetric[];
}

export interface SpeedDashboardViolationPayload {
  vehicle: string;
  driver: string;
  address: string;
  startDate: string;
  startLabel: string;
  endDate: string;
  endLabel: string;
  durationMinutes: string;
  maxSpeed: number;
  location?: string | null;
}
