import type { FuelRecord } from "@/types/fuel";

export type AuditStatus = "MATCH_PERFEITO" | "DIVERGENCIA" | "NAO_NO_SISTEMA";

export interface AuditExtractedItem {
  placa: string;
  data: string;
  litros: number;
  valorTotal: number;
  estabelecimento: string;
  produto: string;
  dateIso: string;
  plateKey: string;
}

export interface AuditResultRow {
  id: string;
  status: AuditStatus;
  invoice: AuditExtractedItem;
  systemRecord: Pick<
    FuelRecord,
    "id" | "date" | "vehicle" | "supplier" | "quantity" | "totalCost" | "fuelType"
  > | null;
  totalDifference: number | null;
  litersDifference: number | null;
}

export interface AuditSummary {
  totalInvoiced: number;
  totalSystem: number;
  totalDifference: number;
  totalItems: number;
  perfectCount: number;
  divergenceCount: number;
  missingCount: number;
}

export interface AuditProcessResponse {
  fileName: string;
  mimeType: string;
  model: string;
  months: string[];
  extractedCount: number;
  summary: AuditSummary;
  results: AuditResultRow[];
}
