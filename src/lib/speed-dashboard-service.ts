import { getFleetOverview } from "@/lib/fleet-management-service";
import { normalizeVehicleKey } from "@/lib/speed-analysis";
import type { FleetVehicle } from "@/types/fleet";
import type {
  SpeedDashboardData,
  SpeedDashboardLocationMetric,
  SpeedDashboardTopOffender,
  SpeedDashboardViolationPayload,
} from "@/types/speed";

type EnrichedViolation = SpeedDashboardViolationPayload & {
  matchedLocation: string | null;
};

function getFleetVehicleMatch(
  vehicleLabel: string,
  fleetAliasLookup: Map<string, FleetVehicle>,
  fleetVehicles: FleetVehicle[],
): FleetVehicle | null {
  const normalizedVehicleLabel = normalizeVehicleKey(vehicleLabel);
  const exactMatch = fleetAliasLookup.get(normalizedVehicleLabel);

  if (exactMatch) {
    return exactMatch;
  }

  return (
    fleetVehicles.find((vehicle) => {
      const normalizedPlate = normalizeVehicleKey(vehicle.plate);
      const normalizedBrandModel = normalizeVehicleKey(vehicle.brandModel);

      return (
        (normalizedPlate && normalizedVehicleLabel.includes(normalizedPlate)) ||
        (normalizedBrandModel && normalizedVehicleLabel.includes(normalizedBrandModel))
      );
    }) ?? null
  );
}

function createEmptyDashboardData(): SpeedDashboardData {
  return {
    summary: {
      totalAlertsCurrentMonth: 0,
      highestSpeed: 0,
      highestSpeedVehicle: null,
      highestSpeedLocation: null,
      topLocation: null,
      topLocationCount: 0,
    },
    topOffenders: [],
    violationsByLocation: [],
  };
}

export async function buildSpeedDashboardData(input: {
  violations: SpeedDashboardViolationPayload[];
  selectedLocation?: string;
}): Promise<SpeedDashboardData> {
  if (!input.violations.length) {
    return createEmptyDashboardData();
  }

  const overview = await getFleetOverview();
  const fleetVehicles = overview.vehicles ?? [];
  const fleetAliasLookup = new Map<string, FleetVehicle>();

  fleetVehicles.forEach((vehicle) => {
    [vehicle.plate, vehicle.brandModel].forEach((alias) => {
      const normalizedAlias = normalizeVehicleKey(alias);

      if (normalizedAlias && !fleetAliasLookup.has(normalizedAlias)) {
        fleetAliasLookup.set(normalizedAlias, vehicle);
      }
    });
  });

  const enrichedViolations: EnrichedViolation[] = input.violations.map((violation) => {
    const matchedFleetVehicle = getFleetVehicleMatch(violation.vehicle, fleetAliasLookup, fleetVehicles);

    return {
      ...violation,
      matchedLocation: matchedFleetVehicle?.location ?? violation.location ?? null,
    };
  });

  const selectedLocation = input.selectedLocation?.trim();
  const filteredViolations =
    selectedLocation && selectedLocation !== "todos"
      ? enrichedViolations.filter((violation) => violation.matchedLocation === selectedLocation)
      : enrichedViolations;

  if (!filteredViolations.length) {
    return createEmptyDashboardData();
  }

  const topOffenderMap = new Map<string, SpeedDashboardTopOffender>();
  const locationMap = new Map<string, number>();
  const now = new Date();
  let totalAlertsCurrentMonth = 0;
  let highestSpeed = 0;
  let highestSpeedVehicle: string | null = null;
  let highestSpeedLocation: string | null = null;

  filteredViolations.forEach((violation) => {
    const offenderKey = violation.vehicle;
    const currentOffender = topOffenderMap.get(offenderKey);

    topOffenderMap.set(offenderKey, {
      vehicle: violation.vehicle,
      location: violation.matchedLocation,
      count: (currentOffender?.count ?? 0) + 1,
    });

    const locationLabel = violation.matchedLocation ?? "Nao informado";
    locationMap.set(locationLabel, (locationMap.get(locationLabel) ?? 0) + 1);

    const startDate = new Date(violation.startDate);

    if (
      !Number.isNaN(startDate.getTime()) &&
      startDate.getMonth() === now.getMonth() &&
      startDate.getFullYear() === now.getFullYear()
    ) {
      totalAlertsCurrentMonth += 1;
    }

    if (violation.maxSpeed > highestSpeed) {
      highestSpeed = violation.maxSpeed;
      highestSpeedVehicle = violation.vehicle;
      highestSpeedLocation = violation.matchedLocation;
    }
  });

  const topOffenders = Array.from(topOffenderMap.values())
    .sort((left, right) => right.count - left.count || left.vehicle.localeCompare(right.vehicle))
    .slice(0, 5);

  const violationsByLocation: SpeedDashboardLocationMetric[] = Array.from(locationMap.entries())
    .map(([location, count]) => ({
      location,
      count,
    }))
    .sort((left, right) => right.count - left.count || left.location.localeCompare(right.location));

  const topLocationEntry = violationsByLocation[0] ?? null;

  return {
    summary: {
      totalAlertsCurrentMonth,
      highestSpeed,
      highestSpeedVehicle,
      highestSpeedLocation,
      topLocation: topLocationEntry?.location ?? null,
      topLocationCount: topLocationEntry?.count ?? 0,
    },
    topOffenders,
    violationsByLocation,
  };
}
