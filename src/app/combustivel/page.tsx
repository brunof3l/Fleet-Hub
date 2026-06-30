import DashboardClient from "@/components/dashboard-client";
import { requirePageUser } from "@/lib/auth";

export default async function CombustivelPage() {
  await requirePageUser();
  return <DashboardClient />;
}
