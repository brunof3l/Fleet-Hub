import SpeedDashboardClient from "@/components/speed-dashboard-client";
import { requirePageUser } from "@/lib/auth";

export default async function VelocidadePage() {
  await requirePageUser();
  return <SpeedDashboardClient />;
}
