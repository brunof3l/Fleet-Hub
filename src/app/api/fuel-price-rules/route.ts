import { saveFuelPriceRule } from "@/lib/fleet-service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      supplier?: string;
      fuelType?: string;
      pricePerLiter?: number;
      effectiveFrom?: string;
    };

    const rule = await saveFuelPriceRule({
      supplier: body.supplier ?? "",
      fuelType: body.fuelType ?? "",
      pricePerLiter: Number(body.pricePerLiter ?? 0),
      effectiveFrom: body.effectiveFrom ?? "",
    });

    return Response.json({
      rule,
      message: "Parametro de preco salvo com sucesso.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao salvar parametro de preco.";
    return Response.json({ message }, { status: 500 });
  }
}
