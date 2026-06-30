import { redirect } from "next/navigation";

import LoginClient from "@/components/login-client";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) {
    redirect("/");
  }
  return <LoginClient />;
}
