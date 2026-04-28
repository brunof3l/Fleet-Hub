import { processAuditDocument } from "@/lib/audit-service";

export const runtime = "nodejs";

const supportedTypes = new Set(["application/pdf", "image/png", "image/jpeg"]);

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const pageImagesRaw = formData.get("pageImages");

    if (!(file instanceof File)) {
      return Response.json({ message: "Envie um arquivo no campo 'file'." }, { status: 400 });
    }

    if (!supportedTypes.has(file.type)) {
      return Response.json(
        { message: "Formato invalido. Envie PDF, PNG, JPG ou JPEG." },
        { status: 400 },
      );
    }

    const pageImages =
      typeof pageImagesRaw === "string" && pageImagesRaw.trim()
        ? (JSON.parse(pageImagesRaw) as string[])
        : undefined;

    if (file.type === "application/pdf" && !pageImages?.length) {
      return Response.json(
        { message: "Para PDFs, gere as paginas em imagem antes do envio." },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await processAuditDocument({
      fileName: file.name,
      mimeType: file.type,
      buffer,
      pageImages,
    });

    return Response.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Falha ao processar a auditoria da fatura.";
    return Response.json({ message }, { status: 500 });
  }
}
