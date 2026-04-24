import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { verifyEmailToken } from "@/server/auth";

export default async function VerifyPage({
  searchParams,
}: {
  searchParams?: Promise<{ token?: string }> | { token?: string };
}) {
  const params = await Promise.resolve(searchParams ?? {});
  const token = typeof params.token === "string" ? params.token : "";

  if (!token) {
    notFound();
  }

  const result = await verifyEmailToken(token);

  return (
    <div className="mx-auto max-w-xl px-6 py-16">
      <Card className="p-8">
        <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted-ink)]">Email verification</p>
        <h1 className="mt-2 text-3xl font-semibold text-[var(--ink)]">
          {result.ok ? "Email verified" : "Verification link expired or invalid"}
        </h1>
        <p className="mt-3 text-sm leading-7 text-[var(--muted-ink)]">
          {result.ok
            ? "Your account is now ready for the app."
            : "Request a new sign-up and use the freshly generated verification link."}
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/app">Open app</Link>
          </Button>
          <Button variant="secondary" asChild>
            <Link href="/auth/sign-up">Create another account</Link>
          </Button>
        </div>
      </Card>
    </div>
  );
}
