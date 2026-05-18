import { getFleetOverview } from "@/lib/fleet-management-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const overview = await getFleetOverview();
    return Response.json(overview);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao carregar a frota.";
    return Response.json({ message }, { status: 500 });
  }
}
