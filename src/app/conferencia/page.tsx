import ConferenceClient from "@/components/conference-client";
import { requirePageUser } from "@/lib/auth";

export default async function ConferenciaPage() {
  await requirePageUser();
  return <ConferenceClient />;
}
