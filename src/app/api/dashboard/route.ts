import type { NextRequest } from "next/server";

import { requireApiUser } from "@/lib/auth";
import { getDashboardSummary } from "@/lib/fleet-service";
import type { DashboardFilters } from "@/types/fuel";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await requireApiUser();
  if (auth instanceof Response) {
    return auth;
  }

  try {
    const filters: DashboardFilters = {
      startDate: request.nextUrl.searchParams.get("startDate") ?? "",
      endDate: request.nextUrl.searchParams.get("endDate") ?? "",
      vehicle: request.nextUrl.searchParams.get("vehicle") ?? "todos",
      fuelType: request.nextUrl.searchParams.get("fuelType") ?? "todos",
      search: request.nextUrl.searchParams.get("search") ?? "",
    };

    const summary = await getDashboardSummary(filters);
    return Response.json(summary);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao carregar dashboard.";
    return Response.json({ message }, { status: 500 });
  }
}
