import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth";
import { saveFleetVehicleCrlv } from "@/lib/fleet-management-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: { vehicleId: string } },
) {
  const auth = await requireApiUser();
  if (auth instanceof Response) {
    return auth;
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Envie um arquivo PDF no campo 'file'." }, { status: 400 });
    }

    const result = await saveFleetVehicleCrlv(params.vehicleId, file);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Falha ao anexar CRLV:", error);
    const message = error instanceof Error ? error.message : "Falha ao anexar o CRLV.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
