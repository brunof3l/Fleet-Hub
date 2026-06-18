import { NextResponse } from "next/server";

import { getFleetVehicleCrlvStream } from "@/lib/fleet-management-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: { vehicleId: string } },
) {
  try {
    const { stream, fileName, plate } = await getFleetVehicleCrlvStream(params.vehicleId);
    const wantsDownload = new URL(request.url).searchParams.get("download") === "1";
    const disposition = wantsDownload ? "attachment" : "inline";
    const safeName = encodeURIComponent(fileName || `${plate}.pdf`);

    return new NextResponse(stream, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${disposition}; filename*=UTF-8''${safeName}`,
        "Cache-Control": "private, max-age=0, no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao carregar o CRLV.";
    return NextResponse.json({ error: message }, { status: 404 });
  }
}
