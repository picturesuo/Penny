import { redirect } from "next/navigation";
import { AuthForm } from "@/components/penny/auth-form";
import { getAuthenticatedUserFromCookies } from "@/server/auth";

export default async function SignInPage() {
  const user = await getAuthenticatedUserFromCookies();
  if (user) {
    redirect("/dashboard");
  }

  return <AuthForm mode="sign-in" />;
}
