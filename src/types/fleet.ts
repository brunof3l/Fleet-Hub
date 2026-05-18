export interface FleetSeedVehicle {
  placa: string;
  chassi: string;
  renavam: string;
  marca_modelo: string;
  ano_fabricacao_modelo: string;
  capacidade_litragem: number;
}

export interface FleetVehicle {
  id: string;
  plate: string;
  chassis: string;
  renavam: string;
  brandModel: string;
  manufacturingModelYear: string;
  tankCapacityLiters: number;
  licensingDueMonth: number;
  licensingDueMonthLabel: string;
  licensingDueDate: string;
  daysUntilLicensing: number;
  isLicensingDueSoon: boolean;
  crlvPdfPath: string | null;
  crlvFileName: string | null;
  hasCrlv: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface FleetLicensingAlert {
  vehicleId: string;
  plate: string;
  brandModel: string;
  licensingDueDate: string;
  licensingDueMonthLabel: string;
  daysUntilLicensing: number;
}

export interface FleetOverview {
  source: "neon" | "empty";
  message?: string;
  totalVehicles: number;
  withCrlvCount: number;
  withoutCrlvCount: number;
  zeroTankCapacityCount: number;
  alerts: FleetLicensingAlert[];
  vehicles: FleetVehicle[];
  vehicleOptions: string[];
}

export interface FleetSeedResult {
  insertedCount: number;
  updatedCount: number;
  totalCount: number;
  message: string;
}

export interface FleetDocumentUploadResult {
  vehicle: FleetVehicle;
  message: string;
}
