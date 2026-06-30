import { hasDatabaseConfig } from "@/lib/env";
import { getFleetOverview } from "@/lib/fleet-management-service";
import { getRecordsByPeriod } from "@/lib/fleet-service";
import { getSpeedOccurrencesByPeriod } from "@/lib/speed-occurrences-service";
import type { FuelRecord } from "@/types/fuel";
import type { OverviewData, OverviewNamedValue } from "@/types/overview";

export interface OverviewFilters {
  startDate: string;
  endDate: string;
}

function todayIsoInBrazil(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Default window: current month plus the two previous months (matches retention). */
export function getDefaultOverviewPeriod(): OverviewFilters {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1))
    .toISOString()
    .slice(0, 10);
  return { startDate: start, endDate: todayIsoInBrazil() };
}

function topByValue(map: Map<string, number>, limit: number): OverviewNamedValue[] {
  return Array.from(map.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((left, right) => right.value - left.value)
    .slice(0, limit);
}

function emptyOverview(filters: OverviewFilters): OverviewData {
  return {
    source: "empty",
    generatedAt: new Date().toISOString(),
    period: filters,
    fuel: {
      totalCost: 0,
      totalLiters: 0,
      avgPrice: 0,
      totalRecords: 0,
      totalDistance: 0,
      avgAutonomy: 0,
      activeVehicles: 0,
      monthly: [],
      topVehiclesByCost: [],
      bySupplier: [],
      byFuelType: [],
    },
    fleet: {
      totalVehicles: 0,
      withCrlv: 0,
      withoutCrlv: 0,
      licensingDueSoon: 0,
      licensingAlerts: [],
      byLocation: [],
    },
    speed: {
      hasData: false,
      totalViolations: 0,
      highestSpeed: 0,
      highestSpeedVehicle: null,
      monthly: [],
      topOffenders: [],
      byLocation: [],
    },
  };
}

function buildFuelSection(records: FuelRecord[]): OverviewData["fuel"] {
  const totalCost = records.reduce((sum, record) => sum + record.totalCost, 0);
  const totalLiters = records.reduce((sum, record) => sum + record.quantity, 0);
  const totalDistance = records.reduce((sum, record) => sum + (record.odometer || 0), 0);

  const costByVehicle = new Map<string, number>();
  const costBySupplier = new Map<string, number>();
  const litersByFuelType = new Map<string, number>();
  const monthlyMap = new Map<string, { cost: number; liters: number }>();

  records.forEach((record) => {
    costByVehicle.set(record.vehicle, (costByVehicle.get(record.vehicle) ?? 0) + record.totalCost);
    costBySupplier.set(record.supplier, (costBySupplier.get(record.supplier) ?? 0) + record.totalCost);
    litersByFuelType.set(record.fuelType, (litersByFuelType.get(record.fuelType) ?? 0) + record.quantity);

    const month = record.date ? record.date.slice(0, 7) : "sem-mes";
    const current = monthlyMap.get(month) ?? { cost: 0, liters: 0 };
    current.cost += record.totalCost;
    current.liters += record.quantity;
    monthlyMap.set(month, current);
  });

  return {
    totalCost,
    totalLiters,
    avgPrice: totalLiters > 0 ? totalCost / totalLiters : 0,
    totalRecords: records.length,
    totalDistance,
    avgAutonomy: totalLiters > 0 ? totalDistance / totalLiters : 0,
    activeVehicles: costByVehicle.size,
    monthly: Array.from(monthlyMap.entries())
      .map(([month, value]) => ({ month, cost: value.cost, liters: value.liters }))
      .sort((left, right) => left.month.localeCompare(right.month)),
    topVehiclesByCost: topByValue(costByVehicle, 8),
    bySupplier: topByValue(costBySupplier, 6),
    byFuelType: topByValue(litersByFuelType, 6),
  };
}

export async function getOverviewData(filters: OverviewFilters): Promise<OverviewData> {
  if (!hasDatabaseConfig()) {
    return emptyOverview(filters);
  }

  const [records, fleet, speedOccurrences] = await Promise.all([
    getRecordsByPeriod(filters.startDate, filters.endDate),
    getFleetOverview(),
    getSpeedOccurrencesByPeriod(filters.startDate, filters.endDate),
  ]);

  const fuel = buildFuelSection(records);

  const locationCounts = new Map<string, number>();
  (fleet.vehicles ?? []).forEach((vehicle) => {
    const label = vehicle.location?.trim() || "Sem local";
    locationCounts.set(label, (locationCounts.get(label) ?? 0) + 1);
  });

  const offenderCounts = new Map<string, number>();
  const speedLocationCounts = new Map<string, number>();
  const speedMonthly = new Map<string, number>();
  let highestSpeed = 0;
  let highestSpeedVehicle: string | null = null;

  speedOccurrences.forEach((occurrence) => {
    offenderCounts.set(occurrence.vehicle, (offenderCounts.get(occurrence.vehicle) ?? 0) + 1);
    const locationLabel = occurrence.location?.trim() || "Nao informado";
    speedLocationCounts.set(locationLabel, (speedLocationCounts.get(locationLabel) ?? 0) + 1);
    const month = occurrence.startDate ? occurrence.startDate.slice(0, 7) : "sem-mes";
    speedMonthly.set(month, (speedMonthly.get(month) ?? 0) + 1);

    if (occurrence.maxSpeed > highestSpeed) {
      highestSpeed = occurrence.maxSpeed;
      highestSpeedVehicle = occurrence.vehicle;
    }
  });

  return {
    source: "neon",
    generatedAt: new Date().toISOString(),
    period: filters,
    fuel,
    fleet: {
      totalVehicles: fleet.totalVehicles,
      withCrlv: fleet.withCrlvCount,
      withoutCrlv: fleet.withoutCrlvCount,
      licensingDueSoon: fleet.alerts.length,
      licensingAlerts: fleet.alerts.slice(0, 8).map((alert) => ({
        plate: alert.plate,
        brandModel: alert.brandModel,
        dueDate: alert.licensingDueDate,
        days: alert.daysUntilLicensing,
      })),
      byLocation: topByValue(locationCounts, 8),
    },
    speed: {
      hasData: speedOccurrences.length > 0,
      totalViolations: speedOccurrences.length,
      highestSpeed,
      highestSpeedVehicle,
      monthly: Array.from(speedMonthly.entries())
        .map(([month, count]) => ({ month, count }))
        .sort((left, right) => left.month.localeCompare(right.month)),
      topOffenders: topByValue(offenderCounts, 8),
      byLocation: topByValue(speedLocationCounts, 6),
    },
  };
}
