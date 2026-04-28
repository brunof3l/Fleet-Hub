import { getCronSecret } from "@/lib/env";
import { cleanupRetention } from "@/lib/fleet-service";

export const runtime = "nodejs";

function isAuthorized(request: Request): boolean {
  const secret = getCronSecret();
  if (!secret) {
    return true;
  }

  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return Response.json({ message: "Nao autorizado." }, { status: 401 });
  }

  try {
    const payload = await request.json().catch(() => ({}));
    const retentionDays = Number(payload?.retentionDays ?? 60);
    const result = await cleanupRetention(retentionDays);
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao executar limpeza automatica.";
    return Response.json({ message }, { status: 500 });
  }
}
