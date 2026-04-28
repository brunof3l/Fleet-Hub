import { ingestWorkbookToDatabase } from "@/lib/fleet-service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return Response.json({ message: "Envie um arquivo .xlsx no campo 'file'." }, { status: 400 });
    }

    const buffer = await file.arrayBuffer();
    const result = await ingestWorkbookToDatabase(file.name, buffer);

    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao processar upload.";
    return Response.json({ message }, { status: 500 });
  }
}
