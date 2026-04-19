import Link from "next/link";
import { Lightbulb, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GlobalShortcuts } from "@/components/penny/global-shortcuts";
import { NewMapDialogProvider, NewMapButton } from "@/components/penny/new-map-modal";
import { QuickCaptureModalProvider } from "@/components/penny/quick-capture-modal";
import { SignOutButton } from "@/components/penny/sign-out-button";
import { getCurrentAuthenticatedUserId } from "@/server/auth";

export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const userId = await getCurrentAuthenticatedUserId();

  return (
    <NewMapDialogProvider>
      <QuickCaptureModalProvider>
        <div className="min-h-screen" data-user-id={userId}>
          <div className="mx-auto max-w-7xl px-6 py-8 lg:px-10">
            <header className="flex flex-col gap-4 border-b border-black/8 pb-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <div className="flex size-11 items-center justify-center rounded-full bg-[var(--ink)] text-[var(--paper)]">
                  <Lightbulb className="size-5" />
                </div>
                <div>
                  <Link href="/app" className="text-lg font-semibold text-[var(--ink)]">
                    Penny
                  </Link>
                  <p className="text-sm text-[var(--muted-ink)]">
                    Pressure-tested personal idea wiki. Signed in and ready to sharpen the map.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Link href="/">
                  <Button variant="ghost">Marketing page</Button>
                </Link>
                <Link href="/app/search">
                  <Button variant="secondary" className="gap-2">
                    <Search className="size-4" />
                    Search
                  </Button>
                </Link>
                <Link href="/app/settings">
                  <Button variant="ghost">Settings</Button>
                </Link>
                <NewMapButton label="Start thought map" className="gap-2" />
                <SignOutButton />
              </div>
            </header>
            <div className="py-8">{children}</div>
          </div>
          <GlobalShortcuts />
        </div>
      </QuickCaptureModalProvider>
    </NewMapDialogProvider>
  );
}
