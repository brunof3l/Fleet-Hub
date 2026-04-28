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
}

export interface SpeedColumnMap {
  date: string;
  vehicle: string;
  speed: string;
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
