import { redirect } from "next/navigation";
import { HomeDashboard } from "@/components/penny/home-dashboard";
import { getAuthenticatedUserFromCookies } from "@/server/auth";
import { getMapsForUser } from "@/server/mvp";

export default async function DashboardPage() {
  const user = await getAuthenticatedUserFromCookies();

  if (!user) {
    redirect("/auth/sign-in");
  }

  const maps = await getMapsForUser(user.id);

  return <HomeDashboard maps={maps} userId={user.id} />;
}
