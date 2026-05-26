import { saveFleetVehicleCrlv } from "@/lib/fleet-management-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: { vehicleId: string } },
) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return Response.json({ message: "Envie um arquivo PDF no campo 'file'." }, { status: 400 });
    }

    const result = await saveFleetVehicleCrlv(params.vehicleId, file);
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao anexar o CRLV.";
    return Response.json({ message }, { status: 500 });
  }
}
