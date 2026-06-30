import { requireApiUser } from "@/lib/auth";
import { seedFleetVehicles } from "@/lib/fleet-management-service";

export const runtime = "nodejs";

export async function POST() {
  const auth = await requireApiUser();
  if (auth instanceof Response) {
    return auth;
  }

  try {
    const result = await seedFleetVehicles();
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao executar a seed da frota.";
    return Response.json({ message }, { status: 500 });
  }
}
