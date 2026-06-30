import { requireApiUser } from "@/lib/auth";
import { isCronAuthorized } from "@/lib/cron-auth";
import { DEFAULT_SYNC_START, syncInfleetFuellings } from "@/lib/infleet-sync";

export const runtime = "nodejs";
export const maxDuration = 60;

function daysAgoIso(days: number): string {
  const date = new Date();
  date.setTime(date.getTime() - days * 24 * 60 * 60 * 1000);
  return date.toISOString().slice(0, 10);
}

// Manual sync triggered from the app (full window since May by default).
export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (auth instanceof Response) {
    return auth;
  }

  try {
    const body = (await request.json().catch(() => ({}))) as { from?: string; to?: string };
    const result = await syncInfleetFuellings(body.from || DEFAULT_SYNC_START, body.to);
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao sincronizar com o Infleet.";
    return Response.json({ message }, { status: 500 });
  }
}

// Scheduled sync (Vercel Cron) — keeps recent launches up to date.
export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return Response.json({ message: "Nao autorizado." }, { status: 401 });
  }

  try {
    const result = await syncInfleetFuellings(daysAgoIso(10));
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao sincronizar com o Infleet.";
    return Response.json({ message }, { status: 500 });
  }
}
