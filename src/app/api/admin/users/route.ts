import { z } from "zod";

import { createUser, listUsers, requireApiAdmin } from "@/lib/auth";

export const runtime = "nodejs";

const createUserSchema = z.object({
  nome: z.string().min(1),
  email: z.string().min(3),
  senha: z.string().min(8),
  role: z.enum(["admin", "user"]).optional(),
});

export async function GET() {
  const auth = await requireApiAdmin();
  if (auth instanceof Response) {
    return auth;
  }

  try {
    const users = await listUsers();
    return Response.json({ users });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao listar usuarios.";
    return Response.json({ message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireApiAdmin();
  if (auth instanceof Response) {
    return auth;
  }

  try {
    const body = await request.json().catch(() => null);
    const parsed = createUserSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { message: "Preencha nome, e-mail e uma senha de ao menos 8 caracteres." },
        { status: 400 },
      );
    }

    const user = await createUser(parsed.data);
    return Response.json({ user, message: "Usuario criado com sucesso." });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao criar usuario.";
    return Response.json({ message }, { status: 400 });
  }
}
