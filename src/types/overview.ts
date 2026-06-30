export interface OverviewNamedValue {
  label: string;
  value: number;
}

export interface OverviewMonthlyFuel {
  month: string;
  cost: number;
  liters: number;
}

export interface OverviewMonthlySpeed {
  month: string;
  count: number;
}

export interface OverviewLicensingAlert {
  plate: string;
  brandModel: string;
  dueDate: string;
  days: number;
}

export interface OverviewData {
  source: "neon" | "empty";
  generatedAt: string;
  period: { startDate: string; endDate: string };
  fuel: {
    totalCost: number;
    totalLiters: number;
    avgPrice: number;
    totalRecords: number;
    totalDistance: number;
    avgAutonomy: number;
    activeVehicles: number;
    monthly: OverviewMonthlyFuel[];
    topVehiclesByCost: OverviewNamedValue[];
    bySupplier: OverviewNamedValue[];
    byFuelType: OverviewNamedValue[];
  };
  fleet: {
    totalVehicles: number;
    withCrlv: number;
    withoutCrlv: number;
    licensingDueSoon: number;
    licensingAlerts: OverviewLicensingAlert[];
    byLocation: OverviewNamedValue[];
  };
  speed: {
    hasData: boolean;
    totalViolations: number;
    highestSpeed: number;
    highestSpeedVehicle: string | null;
    monthly: OverviewMonthlySpeed[];
    topOffenders: OverviewNamedValue[];
    byLocation: OverviewNamedValue[];
  };
}
