import { z } from "zod";

import { deleteUser, requireApiAdmin, resetUserPassword, setUserActive } from "@/lib/auth";

export const runtime = "nodejs";

const patchSchema = z.object({
  ativo: z.boolean().optional(),
  novaSenha: z.string().min(8).optional(),
});

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const auth = await requireApiAdmin();
  if (auth instanceof Response) {
    return auth;
  }

  const id = parseId(params.id);
  if (id === null) {
    return Response.json({ message: "Usuario invalido." }, { status: 400 });
  }

  try {
    const body = await request.json().catch(() => null);
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success || (parsed.data.ativo === undefined && parsed.data.novaSenha === undefined)) {
      return Response.json({ message: "Nenhuma alteracao valida informada." }, { status: 400 });
    }

    if (parsed.data.ativo !== undefined) {
      await setUserActive(id, parsed.data.ativo);
    }
    if (parsed.data.novaSenha !== undefined) {
      await resetUserPassword(id, parsed.data.novaSenha);
    }

    return Response.json({ message: "Usuario atualizado." });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao atualizar usuario.";
    return Response.json({ message }, { status: 400 });
  }
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const auth = await requireApiAdmin();
  if (auth instanceof Response) {
    return auth;
  }

  const id = parseId(params.id);
  if (id === null) {
    return Response.json({ message: "Usuario invalido." }, { status: 400 });
  }

  if (id === auth.id) {
    return Response.json({ message: "Voce nao pode remover o proprio usuario." }, { status: 400 });
  }

  try {
    await deleteUser(id);
    return Response.json({ message: "Usuario removido." });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao remover usuario.";
    return Response.json({ message }, { status: 400 });
  }
}
