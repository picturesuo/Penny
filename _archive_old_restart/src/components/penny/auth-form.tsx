"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type AuthMode = "sign-in" | "sign-up";

type AuthResponse =
  | {
      user: {
        id: string;
        email: string;
        displayName: string;
      };
      verificationUrl?: string;
    }
  | {
      error: string;
      verificationUrl?: string;
    };

export function AuthForm({ mode }: { mode: AuthMode }) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [verificationUrl, setVerificationUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setStatus(null);
    setVerificationUrl(null);

    try {
      const response = await fetch(`/api/auth/${mode === "sign-up" ? "sign-up" : "sign-in"}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          displayName,
          email,
          password,
        }),
      });

      const payload = (await response.json()) as AuthResponse;

      if (!response.ok) {
        const error = "error" in payload ? payload.error : "internal_error";
        setStatus(authErrorMessage(error));
        return;
      }

      if ("verificationUrl" in payload && payload.verificationUrl) {
        setVerificationUrl(payload.verificationUrl);
        setStatus("Verification is required before you can sign in.");
        return;
      }

      setStatus("Signed in.");
      router.push("/dashboard");
      router.refresh();
    } catch {
      setStatus("Penny could not complete authentication right now.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="mx-auto max-w-xl p-8">
      <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted-ink)]">
        {mode === "sign-up" ? "Create account" : "Welcome back"}
      </p>
      <h1 className="mt-2 text-4xl font-semibold text-[var(--ink)]">
        {mode === "sign-up" ? "Start your Penny account" : "Sign in to Penny"}
      </h1>
      <p className="mt-3 text-sm leading-7 text-[var(--muted-ink)]">
        {mode === "sign-up"
          ? "Use email verification and a persistent session cookie to keep your work scoped to your account."
          : "Access your saved maps, sessions, and dashboards."}
      </p>

      <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
        {mode === "sign-up" ? (
          <label className="block space-y-2">
            <span className="text-sm font-medium text-[var(--ink)]">Display name</span>
            <input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              className="w-full rounded-[18px] border border-black/10 bg-[var(--panel)] px-4 py-3 text-sm text-[var(--ink)] outline-none"
              placeholder="Founder name"
            />
          </label>
        ) : null}
        <label className="block space-y-2">
          <span className="text-sm font-medium text-[var(--ink)]">Email</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full rounded-[18px] border border-black/10 bg-[var(--panel)] px-4 py-3 text-sm text-[var(--ink)] outline-none"
            placeholder="you@company.com"
          />
        </label>
        <label className="block space-y-2">
          <span className="text-sm font-medium text-[var(--ink)]">Password</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full rounded-[18px] border border-black/10 bg-[var(--panel)] px-4 py-3 text-sm text-[var(--ink)] outline-none"
            placeholder="At least 8 characters"
          />
        </label>

        {status ? <p className="text-sm leading-6 text-[var(--muted-ink)]">{status}</p> : null}
        {verificationUrl ? (
          <div className="rounded-[18px] border border-black/10 bg-[var(--panel)] p-4">
            <p className="text-sm font-medium text-[var(--ink)]">Verification link</p>
            <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">
              Open this link to verify your email, then return here to sign in.
            </p>
            <Link className="mt-3 inline-flex text-sm font-medium text-[var(--ink)] underline" href={verificationUrl}>
              {verificationUrl}
            </Link>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={loading}>
            {loading ? "Working..." : mode === "sign-up" ? "Create account" : "Sign in"}
          </Button>
          <Button variant="secondary" type="button" asChild>
            <Link href={mode === "sign-up" ? "/auth/sign-in" : "/auth/sign-up"}>
              {mode === "sign-up" ? "I already have an account" : "Create an account"}
            </Link>
          </Button>
        </div>
      </form>
    </Card>
  );
}

function authErrorMessage(error: string) {
  switch (error) {
    case "email_already_in_use":
      return "That email is already in use.";
    case "email_not_found":
      return "No account exists for that email.";
    case "wrong_password":
      return "That password is incorrect.";
    case "email_not_verified":
      return "Verify your email before signing in.";
    default:
      return "Authentication failed.";
  }
}
