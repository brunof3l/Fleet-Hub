import { getFleetVehicleById } from "@/lib/fleet-management-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: { vehicleId: string } },
) {
  try {
    const vehicle = await getFleetVehicleById(params.vehicleId);
    return Response.json(vehicle);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao carregar o veiculo da frota.";
    return Response.json({ message }, { status: 500 });
  }
}
