import { NextResponse } from "next/server";

import { saveFleetVehicleCrlv } from "@/lib/fleet-management-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: { vehicleId: string } },
) {
  try {
    // #region debug-point B:route-formdata-start
    console.log("A iniciar rececao do FormData...");
    // #endregion
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Envie um arquivo PDF no campo 'file'." }, { status: 400 });
    }

    // #region debug-point B:route-file-received
    console.log("Ficheiro recebido:", file.name, file.size);
    // #endregion

    const result = await saveFleetVehicleCrlv(params.vehicleId, file);
    return NextResponse.json(result);
  } catch (error) {
    // #region debug-point E:route-error
    console.error("ERRO DETETADO:", error);
    // #endregion
    const message = error instanceof Error ? error.message : "Falha ao anexar o CRLV.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
