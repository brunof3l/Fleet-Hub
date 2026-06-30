import { getSessionUser } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return Response.json({ message: "Nao autenticado." }, { status: 401 });
  }
  return Response.json({ user: { nome: user.nome, email: user.email, role: user.role } });
}
