import Link from "next/link";
import { Lightbulb, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="min-h-screen">
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
            <Link href="/app/new">
              <Button className="gap-2">
                <Plus className="size-4" />
                Start thought map
              </Button>
            </Link>
          </div>
        </header>
        <div className="py-8">{children}</div>
      </div>
    </div>
  );
}
