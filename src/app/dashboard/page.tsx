import { redirect } from "next/navigation";
import { HomeDashboard } from "@/components/penny/home-dashboard";
import { getMapsForUser } from "@/server/mvp";
import { getCurrentUserId } from "@/lib/auth";

export default async function DashboardPage() {
  const userId = await getCurrentUserId();

  if (!userId) {
    redirect("/auth/sign-in");
  }

  const maps = await getMapsForUser(userId);

  return <HomeDashboard maps={maps} userId={userId} />;
}
