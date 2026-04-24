import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function LoadingState({ label = "Loading" }: { label?: string }) {
  return (
    <Card className="p-6">
      <div className="flex items-center gap-3">
        <div className="size-3 animate-pulse rounded-full bg-[var(--ink)]" />
        <p className="text-sm text-[var(--muted-ink)]">{label}…</p>
      </div>
    </Card>
  );
}

export function NoMapsEmptyState({ onCreate }: { onCreate?: () => void }) {
  return (
    <Card className="p-8">
      <div className="max-w-xl">
        <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted-ink)]">No maps yet</p>
        <h2 className="mt-3 text-3xl font-semibold text-[var(--ink)]">Start with one claim that matters.</h2>
        <p className="mt-3 text-sm leading-7 text-[var(--muted-ink)]">
          A map becomes useful as soon as Penny can pressure-test one real belief. The first win should happen in the first session.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Button onClick={onCreate}>Create your first map</Button>
          <Button variant="secondary">See an example</Button>
        </div>
      </div>
    </Card>
  );
}

export function NoClaimsEmptyState({ mapId }: { mapId: string }) {
  return (
    <Card className="p-6">
      <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted-ink)]">Empty map</p>
      <h3 className="mt-2 text-2xl font-semibold text-[var(--ink)]">This map has no claims yet.</h3>
      <p className="mt-3 text-sm leading-7 text-[var(--muted-ink)]">
        Add one claim to give the map structure, then let Penny branch assumptions and critique from there.
      </p>
      <p className="mt-3 text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Map ID: {mapId}</p>
    </Card>
  );
}

export function FeatureErrorState({ featureName, onRetry }: { featureName: string; onRetry: () => void }) {
  return (
    <Card className="p-6">
      <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted-ink)]">Something broke</p>
      <h3 className="mt-2 text-2xl font-semibold text-[var(--ink)]">{featureName} encountered an error.</h3>
      <p className="mt-3 text-sm leading-7 text-[var(--muted-ink)]">
        Penny could not finish that step. Retry the action or refresh the surface.
      </p>
      <Button className="mt-4" onClick={onRetry}>
        Try again
      </Button>
    </Card>
  );
}
