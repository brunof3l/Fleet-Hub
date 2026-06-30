import { requireApiUser } from "@/lib/auth";
import { deleteFuelRecord } from "@/lib/fleet-service";

export const runtime = "nodejs";

export async function DELETE(request: Request) {
  const auth = await requireApiUser();
  if (auth instanceof Response) {
    return auth;
  }

  try {
    const body = (await request.json()) as {
      id?: string;
    };

    const record = await deleteFuelRecord(body.id ?? "");

    return Response.json({
      record,
      message: "Registro removido com sucesso.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao remover registro.";
    return Response.json({ message }, { status: 500 });
  }
}
