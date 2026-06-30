import FleetDashboardClient from "@/components/fleet-dashboard-client";
import { requirePageUser } from "@/lib/auth";

export default async function FrotaPage() {
  await requirePageUser();
  return <FleetDashboardClient />;
}
