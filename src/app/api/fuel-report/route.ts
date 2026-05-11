import { applyFuelReportFilters, getAllFuelRecords } from "@/lib/fleet-service";
import { buildDetailedFuelPdfReport } from "@/lib/fuel-pdf-report";
import type { FuelReportFilters } from "@/types/fuel";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<FuelReportFilters>;
    const filters: FuelReportFilters = {
      vehicle: body.vehicle ?? "todos",
      supplier: body.supplier ?? "todos",
      reportMonth: body.reportMonth ?? "",
      reportDay: body.reportDay ?? "",
    };

    const records = applyFuelReportFilters(await getAllFuelRecords(), filters);

    if (!records.length) {
      return Response.json(
        { message: "Nenhum abastecimento encontrado para os filtros selecionados." },
        { status: 400 },
      );
    }

    const report = await buildDetailedFuelPdfReport({
      records,
      filters,
    });

    return new Response(report.buffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${report.fileName}"`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao gerar o relatorio em PDF.";
    console.error("fuel-report error:", error);
    return Response.json({ message }, { status: 500 });
  }
}
