import AdminClient from "@/components/admin-client";
import { requirePageAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await requirePageAdmin();
  return <AdminClient currentUserEmail={user.email} />;
}
