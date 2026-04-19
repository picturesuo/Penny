"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { reportError, getClientUserId } from "@/lib/error-reporting";
import { getDemoThoughtUserId } from "@/lib/thought-map";

type AppSegmentErrorProps = {
  error: Error & { digest?: string };
  reset?: () => void;
  unstable_retry?: () => void;
};

export default function Error({ error, reset, unstable_retry }: AppSegmentErrorProps) {
  useEffect(() => {
    reportError(error, {
      userId: getClientUserId() ?? getDemoThoughtUserId(),
      requestPath: window.location.pathname + window.location.search,
      requestMethod: "CLIENT",
      featureId: "app-segment",
      additionalData: {
        digest: error.digest ?? null,
      },
    });
  }, [error]);

  const retry = unstable_retry ?? reset;

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-2xl items-center px-6 py-16">
      <div className="w-full rounded-[32px] border border-black/8 bg-[var(--panel)] p-8 shadow-[0_24px_64px_rgba(10,13,28,0.08)]">
        <div className="flex items-center gap-3 text-[var(--ink)]">
          <AlertTriangle className="size-5" />
          <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted-ink)]">App section error</p>
        </div>
        <h1 className="mt-4 text-3xl font-semibold text-[var(--ink)]">This section failed to render.</h1>
        <p className="mt-3 text-sm leading-7 text-[var(--muted-ink)]">
          The failure was captured with file, line, route, and user context. You can retry or leave the section.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button onClick={() => retry?.()} className="gap-2">
            <RotateCcw className="size-4" />
            Try again
          </Button>
          <Link href="/app">
            <Button variant="secondary">Back to dashboard</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
