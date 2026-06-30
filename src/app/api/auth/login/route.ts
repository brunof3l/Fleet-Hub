import { z } from "zod";

import { createSession, verifyCredentials } from "@/lib/auth";
import { hasDatabaseConfig } from "@/lib/env";

export const runtime = "nodejs";

const loginSchema = z.object({
  email: z.string().min(1),
  senha: z.string().min(1),
});

export async function POST(request: Request) {
  if (!hasDatabaseConfig()) {
    return Response.json({ message: "Banco de dados nao configurado." }, { status: 500 });
  }

  try {
    const body = await request.json().catch(() => null);
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ message: "Informe e-mail e senha." }, { status: 400 });
    }

    const user = await verifyCredentials(parsed.data.email, parsed.data.senha);
    if (!user) {
      // Generic message to avoid user enumeration.
      return Response.json({ message: "E-mail ou senha invalidos." }, { status: 401 });
    }

    await createSession(user.id);

    return Response.json({ user: { nome: user.nome, email: user.email, role: user.role } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao autenticar.";
    return Response.json({ message }, { status: 500 });
  }
}
