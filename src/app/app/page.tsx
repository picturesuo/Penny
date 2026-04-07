import Link from "next/link";
import { Plus } from "lucide-react";
import { SessionCard } from "@/components/penny/session-card";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { listSessions } from "@/server/penny";

export default async function DashboardPage() {
  const sessions = await listSessions();

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted-ink)]">Dashboard</p>
          <h1 className="mt-2 text-4xl font-semibold text-[var(--ink)]">Pressure-test before you build.</h1>
          <p className="mt-3 max-w-2xl text-base leading-7 text-[var(--muted-ink)]">
            Penny remembers prior sessions, keeps the pressure structured, and lets you continue where the logic got interesting.
          </p>
        </div>
        <Link href="/app/new">
          <Button className="gap-2">
            <Plus className="size-4" />
            Start new idea
          </Button>
        </Link>
      </div>

      {sessions.length ? (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {sessions.map((session) => (
            <SessionCard key={session.id} session={session} />
          ))}
        </div>
      ) : (
        <Card className="p-10">
          <h2 className="text-2xl font-semibold text-[var(--ink)]">No sessions yet</h2>
          <p className="mt-3 max-w-xl text-base leading-7 text-[var(--muted-ink)]">
            Penny takes a rough idea, asks hard questions, extracts assumptions and risks, then leaves you with a sharper validation path.
          </p>
        </Card>
      )}
    </div>
  );
}
