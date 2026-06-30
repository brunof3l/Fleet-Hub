import { destroySession } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST() {
  try {
    await destroySession();
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: true });
  }
}
