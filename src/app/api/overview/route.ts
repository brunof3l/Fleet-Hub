import type { NextRequest } from "next/server";

import { requireApiUser } from "@/lib/auth";
import { getDefaultOverviewPeriod, getOverviewData } from "@/lib/overview-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: NextRequest) {
  const auth = await requireApiUser();
  if (auth instanceof Response) {
    return auth;
  }

  try {
    const defaults = getDefaultOverviewPeriod();
    const startParam = request.nextUrl.searchParams.get("startDate");
    const endParam = request.nextUrl.searchParams.get("endDate");

    const startDate = startParam && ISO_DATE.test(startParam) ? startParam : defaults.startDate;
    const endDate = endParam && ISO_DATE.test(endParam) ? endParam : defaults.endDate;

    const data = await getOverviewData({ startDate, endDate });
    return Response.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao montar o overview.";
    return Response.json({ message }, { status: 500 });
  }
}
