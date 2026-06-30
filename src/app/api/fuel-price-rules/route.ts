import { requireApiUser } from "@/lib/auth";
import { deleteFuelPriceRule, saveFuelPriceRule } from "@/lib/fleet-service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (auth instanceof Response) {
    return auth;
  }

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

export async function PUT(request: Request) {
  const auth = await requireApiUser();
  if (auth instanceof Response) {
    return auth;
  }

  try {
    const body = (await request.json()) as {
      id?: string;
      supplier?: string;
      fuelType?: string;
      pricePerLiter?: number;
      effectiveFrom?: string;
    };

    const rule = await saveFuelPriceRule({
      id: body.id,
      supplier: body.supplier ?? "",
      fuelType: body.fuelType ?? "",
      pricePerLiter: Number(body.pricePerLiter ?? 0),
      effectiveFrom: body.effectiveFrom ?? "",
    });

    return Response.json({
      rule,
      message: "Parametro de preco atualizado com sucesso.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao atualizar parametro de preco.";
    return Response.json({ message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const auth = await requireApiUser();
  if (auth instanceof Response) {
    return auth;
  }

  try {
    const body = (await request.json()) as {
      id?: string;
    };

    const rule = await deleteFuelPriceRule(body.id ?? "");

    return Response.json({
      rule,
      message: "Parametro de preco removido com sucesso.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao remover parametro de preco.";
    return Response.json({ message }, { status: 500 });
  }
}
