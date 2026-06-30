import { requireApiUser } from "@/lib/auth";
import { buildSpeedDashboardData } from "@/lib/speed-dashboard-service";
import type { SpeedDashboardViolationPayload } from "@/types/speed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (auth instanceof Response) {
    return auth;
  }

  try {
    const body = (await request.json()) as {
      violations?: SpeedDashboardViolationPayload[];
      selectedLocation?: string;
    };

    const violations = Array.isArray(body.violations) ? body.violations : [];
    const dashboard = await buildSpeedDashboardData({
      violations,
      selectedLocation: body.selectedLocation ?? "todos",
    });

    return Response.json(dashboard);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Falha ao montar o dashboard de velocidade.";
    return Response.json({ message }, { status: 500 });
  }
}
