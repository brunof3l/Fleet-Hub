import OverviewClient from "@/components/overview-client";
import { requirePageUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function ApresentacaoPage() {
  await requirePageUser();
  return <OverviewClient />;
}
