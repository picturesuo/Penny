"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getClientUserId, reportError } from "@/lib/error-reporting";
import { getDemoThoughtUserId } from "@/lib/thought-map";

type GlobalErrorProps = {
  error: Error & { digest?: string };
  reset?: () => void;
  unstable_retry?: () => void;
};

export default function GlobalError({ error, reset, unstable_retry }: GlobalErrorProps) {
  useEffect(() => {
    reportError(error, {
      userId: getClientUserId() ?? getDemoThoughtUserId(),
      requestPath: window.location.pathname + window.location.search,
      requestMethod: "CLIENT",
      featureId: "global-layout",
      additionalData: {
        digest: error.digest ?? null,
      },
    });
  }, [error]);

  const retry = unstable_retry ?? reset;

  return (
    <html lang="en">
      <body className="min-h-screen bg-[var(--paper)] text-[var(--ink)]" data-user-id={getDemoThoughtUserId()}>
        <div className="mx-auto flex min-h-screen max-w-2xl items-center px-6 py-16">
          <div className="w-full rounded-[32px] border border-black/8 bg-[var(--panel)] p-8 shadow-[0_24px_64px_rgba(10,13,28,0.08)]">
            <div className="flex items-center gap-3 text-[var(--ink)]">
              <AlertTriangle className="size-5" />
              <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted-ink)]">Root error</p>
            </div>
            <h1 className="mt-4 text-3xl font-semibold text-[var(--ink)]">Penny hit a root-level error.</h1>
            <p className="mt-3 text-sm leading-7 text-[var(--muted-ink)]">
              This error was logged with route context and stack location so it can be diagnosed instead of silently failing.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button onClick={() => retry?.()} className="gap-2">
                <RotateCcw className="size-4" />
                Try again
              </Button>
              <Link href="/">
                <Button variant="secondary">Go home</Button>
              </Link>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
