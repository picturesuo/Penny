"use client";

import { useEffect, useMemo } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { DEMO_USER_ID } from "@/lib/penny";
import { getClientUserId } from "@/lib/error-reporting";
import { track } from "@/lib/analytics";

export function AnalyticsPageTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const path = useMemo(() => {
    const query = searchParams?.toString();
    return query && query.length > 0 ? `${pathname}?${query}` : pathname;
  }, [pathname, searchParams]);

  useEffect(() => {
    const userId = getClientUserId();
    void track(
      {
        event: "page_view",
        properties: {
          path,
        },
      },
      userId && userId !== DEMO_USER_ID ? userId : undefined,
    );
  }, [path]);

  return null;
}
