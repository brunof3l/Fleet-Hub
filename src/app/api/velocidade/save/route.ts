import { requireApiUser } from "@/lib/auth";
import { saveSpeedOccurrences, type SpeedOccurrenceInput } from "@/lib/speed-occurrences-service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (auth instanceof Response) {
    return auth;
  }

  try {
    const body = (await request.json().catch(() => null)) as { occurrences?: SpeedOccurrenceInput[] } | null;
    const occurrences = Array.isArray(body?.occurrences) ? body!.occurrences : [];

    if (!occurrences.length) {
      return Response.json({ inserted: 0, received: 0 });
    }

    const result = await saveSpeedOccurrences(occurrences);
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao salvar ocorrencias de velocidade.";
    return Response.json({ message }, { status: 500 });
  }
}
