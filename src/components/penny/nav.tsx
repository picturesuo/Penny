"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { QuickCapture } from "@/components/penny/quick-capture";
import { NewMapButton } from "@/components/penny/new-map-modal";
import { SignOutButton } from "@/components/penny/sign-out-button";

interface NavProps {
  userId: string;
  userEmail: string;
}

export function Nav({ userId, userEmail }: NavProps) {
  const pathname = usePathname();
  const isDashboardActive = pathname === "/dashboard" || pathname.startsWith("/dashboard/");
  const isSettingsActive = pathname === "/app/settings";

  return (
    <nav className="flex flex-col gap-4 border-b border-black/8 pb-5 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/dashboard" className="text-lg font-semibold text-[var(--ink)]">
          Penny
        </Link>
        <Badge className="bg-white text-[var(--muted-ink)]">Signed in</Badge>
        <span className="text-sm text-[var(--muted-ink)]">{userEmail}</span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Link
          href="/dashboard"
          className={navLinkClass(isDashboardActive)}
          aria-current={isDashboardActive ? "page" : undefined}
        >
          Maps
        </Link>
        <Link
          href="/app/settings"
          className={navLinkClass(isSettingsActive)}
          aria-current={isSettingsActive ? "page" : undefined}
        >
          Settings
        </Link>
        <QuickCapture userId={userId} />
        <NewMapButton label="New map" className="gap-2" />
        <Button variant="ghost" asChild>
          <Link href="/app/search">Search</Link>
        </Button>
        <SignOutButton />
      </div>
    </nav>
  );
}

function navLinkClass(active: boolean) {
  return [
    "rounded-full px-4 py-2 text-sm font-medium transition",
    active ? "bg-[var(--ink)] text-[var(--paper)]" : "text-[var(--muted-ink)] hover:bg-black/5 hover:text-[var(--ink)]",
  ].join(" ");
}
