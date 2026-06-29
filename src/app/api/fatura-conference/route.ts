import { conferFaturaBuffer } from "@/lib/fatura-conference";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return Response.json(
        { message: "Envie o PDF da fatura do posto no campo 'file'." },
        { status: 400 },
      );
    }

    const normalizedName = file.name.toLowerCase();
    if (!normalizedName.endsWith(".pdf")) {
      return Response.json(
        { message: "Formato invalido. Envie a fatura em PDF." },
        { status: 400 },
      );
    }

    const buffer = await file.arrayBuffer();
    const result = await conferFaturaBuffer(file.name, buffer);

    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao conferir a fatura.";
    return Response.json({ message }, { status: 500 });
  }
}
