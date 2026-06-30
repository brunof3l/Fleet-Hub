import { isCronAuthorized } from "@/lib/cron-auth";
import { cleanupRetention } from "@/lib/fleet-service";
import { hasInfleetConfig } from "@/lib/infleet-service";
import { syncInfleetFuellings } from "@/lib/infleet-sync";

export const runtime = "nodejs";
export const maxDuration = 60;

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export async function POST(request: Request) {
  if (!isCronAuthorized(request)) {
    return Response.json({ message: "Nao autorizado." }, { status: 401 });
  }

  // Daily Infleet sync (recent window) so new launches reach the site
  // automatically. Failures here must not block the retention cleanup.
  let infleetSync: unknown = null;
  if (hasInfleetConfig()) {
    try {
      infleetSync = await syncInfleetFuellings(daysAgoIso(10));
    } catch (error) {
      infleetSync = { error: error instanceof Error ? error.message : "Falha ao sincronizar Infleet." };
    }
  }

  try {
    const payload = await request.json().catch(() => ({}));
    const retentionMonths = Number(payload?.retentionMonths ?? 3);
    const result = await cleanupRetention(retentionMonths);
    return Response.json({ ...result, infleetSync });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao executar limpeza automatica.";
    return Response.json({ message }, { status: 500 });
  }
}
