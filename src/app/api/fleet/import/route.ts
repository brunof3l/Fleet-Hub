import { requireApiUser } from "@/lib/auth";
import { importFleetSpreadsheet } from "@/lib/fleet-management-service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (auth instanceof Response) {
    return auth;
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return Response.json({ message: "Envie uma planilha .xlsx ou .csv no campo 'file'." }, { status: 400 });
    }

    const normalizedName = file.name.toLowerCase();

    if (!normalizedName.endsWith(".xlsx") && !normalizedName.endsWith(".csv")) {
      return Response.json({ message: "Formato invalido. Envie um arquivo .xlsx ou .csv." }, { status: 400 });
    }

    const buffer = await file.arrayBuffer();
    const result = await importFleetSpreadsheet(file.name, buffer);

    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao importar a planilha da frota.";
    return Response.json({ message }, { status: 500 });
  }
}
