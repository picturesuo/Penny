import Link from "next/link";
import type { InternalAiRunRecord, InternalAiRunsResponse } from "@/types/ai-runs";

export type AdminAiRunStatusView = "all" | "pending" | "success" | "failed" | "validation_failed";

type InternalAiRunsAdminProps = {
  apiHref: string;
  query: {
    claimId: string;
    dateFrom: string;
    dateTo: string;
    limit: string;
    model: string;
    promptVersion: string;
    provider: string;
    roundId: string;
    status: AdminAiRunStatusView;
    userId: string;
  };
  response: InternalAiRunsResponse;
  unsupportedStatusMessage: string | null;
};

const statusTabs: Array<{
  description: string;
  label: string;
  value: AdminAiRunStatusView;
}> = [
  {
    value: "all",
    label: "All",
    description: "All persisted challenge AI runs.",
  },
  {
    value: "pending",
    label: "Pending",
    description: "Challenge critiques that were requested but not yet persisted as generated.",
  },
  {
    value: "success",
    label: "Success",
    description: "Challenge critiques that completed and were persisted.",
  },
  {
    value: "failed",
    label: "Failed",
    description: "Requested for parity with operator workflows; currently not backed by ai_runs persistence.",
  },
  {
    value: "validation_failed",
    label: "Validation Failed",
    description: "Requested for parity with operator workflows; currently not backed by ai_runs persistence.",
  },
];

export function InternalAiRunsAdmin({
  apiHref,
  query,
  response,
  unsupportedStatusMessage,
}: InternalAiRunsAdminProps) {
  const runs = response.runs;

  return (
    <section className="mx-auto flex min-h-screen w-full max-w-[1400px] flex-col gap-6 px-6 py-8 lg:px-10">
      <header className="flex flex-col gap-3 rounded-[28px] border border-[var(--line)] bg-[rgba(255,255,255,0.82)] px-6 py-6 shadow-[0_10px_30px_rgba(38,30,25,0.04)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--muted-ink)]">Internal Admin</p>
            <h1 className="mt-2 font-display text-4xl leading-none text-[var(--ink)]">AI Runs</h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-[var(--muted-ink)]">
              Read-only operator view over Penny&apos;s persisted challenge AI executions. This surface reflects what the
              backend can prove today from `challenge_critiques` and `moves_events`.
            </p>
          </div>

          <div className="rounded-[20px] border border-[var(--line)] bg-[var(--panel)] px-4 py-3 text-sm text-[var(--muted-ink)]">
            <p>{response.meta.count} row(s)</p>
            <p className="mt-1">Limit {response.meta.limit}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {statusTabs.map((tab) => {
            const href = buildStatusHref(query, tab.value);
            const active = query.status === tab.value;

            return (
              <Link
                key={tab.value}
                href={href}
                className={`rounded-full border px-4 py-2 text-sm transition ${
                  active
                    ? "border-[var(--ink)] bg-[var(--ink)] text-white"
                    : "border-[var(--line)] bg-white text-[var(--muted-ink)] hover:border-[var(--ink)] hover:text-[var(--ink)]"
                }`}
                title={tab.description}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>
      </header>

      <section className="rounded-[28px] border border-[var(--line)] bg-[rgba(255,255,255,0.82)] px-6 py-6 shadow-[0_10px_30px_rgba(38,30,25,0.04)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-[var(--ink)]">Filters</h2>
            <p className="mt-1 text-sm text-[var(--muted-ink)]">Use query-string filters so operators can bookmark a view.</p>
          </div>

          <div className="text-sm text-[var(--muted-ink)]">
            API:
            {" "}
            <Link href={apiHref} className="font-mono text-[var(--ink)] underline-offset-4 hover:underline">
              {apiHref}
            </Link>
          </div>
        </div>

        <form method="get" className="mt-5 grid gap-4 lg:grid-cols-5">
          <label className="flex flex-col gap-2 text-sm text-[var(--muted-ink)]">
            Provider
            <input
              name="provider"
              defaultValue={query.provider}
              className="rounded-[16px] border border-[var(--line)] bg-white px-3 py-2.5 text-[var(--ink)] outline-none transition focus:border-[var(--ink)]"
              placeholder="anthropic"
            />
          </label>

          <label className="flex flex-col gap-2 text-sm text-[var(--muted-ink)]">
            Model
            <input
              name="model"
              defaultValue={query.model}
              className="rounded-[16px] border border-[var(--line)] bg-white px-3 py-2.5 text-[var(--ink)] outline-none transition focus:border-[var(--ink)]"
              placeholder="claude-..."
            />
          </label>

          <label className="flex flex-col gap-2 text-sm text-[var(--muted-ink)]">
            Prompt version
            <input
              name="prompt_version"
              defaultValue={query.promptVersion}
              className="rounded-[16px] border border-[var(--line)] bg-white px-3 py-2.5 text-[var(--ink)] outline-none transition focus:border-[var(--ink)]"
              placeholder="challenge-critique.v1"
            />
          </label>

          <label className="flex flex-col gap-2 text-sm text-[var(--muted-ink)]">
            User ID
            <input
              name="user_id"
              defaultValue={query.userId}
              className="rounded-[16px] border border-[var(--line)] bg-white px-3 py-2.5 font-mono text-[var(--ink)] outline-none transition focus:border-[var(--ink)]"
              placeholder="UUID"
            />
          </label>

          <label className="flex flex-col gap-2 text-sm text-[var(--muted-ink)]">
            Status
            <select
              name="status"
              defaultValue={query.status}
              className="rounded-[16px] border border-[var(--line)] bg-white px-3 py-2.5 text-[var(--ink)] outline-none transition focus:border-[var(--ink)]"
            >
              {statusTabs.map((tab) => (
                <option key={tab.value} value={tab.value}>
                  {tab.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-2 text-sm text-[var(--muted-ink)]">
            Claim ID
            <input
              name="claim_id"
              defaultValue={query.claimId}
              className="rounded-[16px] border border-[var(--line)] bg-white px-3 py-2.5 font-mono text-[var(--ink)] outline-none transition focus:border-[var(--ink)]"
              placeholder="UUID"
            />
          </label>

          <label className="flex flex-col gap-2 text-sm text-[var(--muted-ink)]">
            Round ID
            <input
              name="round_id"
              defaultValue={query.roundId}
              className="rounded-[16px] border border-[var(--line)] bg-white px-3 py-2.5 font-mono text-[var(--ink)] outline-none transition focus:border-[var(--ink)]"
              placeholder="UUID"
            />
          </label>

          <label className="flex flex-col gap-2 text-sm text-[var(--muted-ink)]">
            Date from
            <input
              type="datetime-local"
              name="date_from"
              defaultValue={query.dateFrom}
              className="rounded-[16px] border border-[var(--line)] bg-white px-3 py-2.5 text-[var(--ink)] outline-none transition focus:border-[var(--ink)]"
            />
          </label>

          <label className="flex flex-col gap-2 text-sm text-[var(--muted-ink)]">
            Date to
            <input
              type="datetime-local"
              name="date_to"
              defaultValue={query.dateTo}
              className="rounded-[16px] border border-[var(--line)] bg-white px-3 py-2.5 text-[var(--ink)] outline-none transition focus:border-[var(--ink)]"
            />
          </label>

          <label className="flex flex-col gap-2 text-sm text-[var(--muted-ink)]">
            Limit
            <input
              type="number"
              min={1}
              max={200}
              name="limit"
              defaultValue={query.limit}
              className="rounded-[16px] border border-[var(--line)] bg-white px-3 py-2.5 text-[var(--ink)] outline-none transition focus:border-[var(--ink)]"
            />
          </label>

          <div className="flex items-end gap-3 lg:col-span-5">
            <button
              type="submit"
              className="rounded-full bg-[var(--ink)] px-5 py-2.5 text-sm font-medium text-white transition hover:opacity-92"
            >
              Apply filters
            </button>
            <Link
              href="/internal/ai-runs"
              className="rounded-full border border-[var(--line)] bg-white px-5 py-2.5 text-sm text-[var(--muted-ink)] transition hover:border-[var(--ink)] hover:text-[var(--ink)]"
            >
              Reset
            </Link>
          </div>
        </form>
      </section>

      {unsupportedStatusMessage ? (
        <section className="rounded-[24px] border border-[#d9b77d] bg-[#fff7e6] px-5 py-4 text-sm leading-7 text-[#7b5a1a]">
          <p className="font-medium text-[#5e4311]">Status view unavailable in current ai_runs source of truth.</p>
          <p className="mt-1">{unsupportedStatusMessage}</p>
        </section>
      ) : null}

      <section className="overflow-hidden rounded-[28px] border border-[var(--line)] bg-[rgba(255,255,255,0.9)] shadow-[0_10px_30px_rgba(38,30,25,0.04)]">
        <div className="overflow-x-auto">
          <table className="min-w-full border-separate border-spacing-0 text-left">
            <thead>
              <tr className="bg-[var(--panel)] text-xs uppercase tracking-[0.16em] text-[var(--muted-ink)]">
                <th className="border-b border-[var(--line)] px-4 py-3 font-medium">Status</th>
                <th className="border-b border-[var(--line)] px-4 py-3 font-medium">Occurred</th>
                <th className="border-b border-[var(--line)] px-4 py-3 font-medium">Provider / model</th>
                <th className="border-b border-[var(--line)] px-4 py-3 font-medium">Claim</th>
                <th className="border-b border-[var(--line)] px-4 py-3 font-medium">Round</th>
                <th className="border-b border-[var(--line)] px-4 py-3 font-medium">User</th>
                <th className="border-b border-[var(--line)] px-4 py-3 font-medium">Trace</th>
                <th className="border-b border-[var(--line)] px-4 py-3 font-medium">Validation failure reason</th>
              </tr>
            </thead>
            <tbody>
              {runs.length ? (
                runs.map((run) => <AiRunRow key={`${run.source}:${run.id}`} run={run} />)
              ) : (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-sm text-[var(--muted-ink)]">
                    No AI runs matched the current view.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}

function AiRunRow({ run }: { run: InternalAiRunRecord }) {
  return (
    <tr className="align-top text-sm text-[var(--ink)]">
      <td className="border-b border-[var(--line)] px-4 py-4">
        <StatusBadge status={run.status} />
        <p className="mt-2 text-xs text-[var(--muted-ink)]">{run.source === "moves_events" ? "event-backed" : "critique-backed"}</p>
      </td>
      <td className="border-b border-[var(--line)] px-4 py-4">
        <p>{formatTimestamp(run.occurredAt)}</p>
        {run.requestedAt && run.generatedAt ? (
          <p className="mt-1 text-xs text-[var(--muted-ink)]">Requested {formatTimestamp(run.requestedAt)}</p>
        ) : null}
      </td>
      <td className="border-b border-[var(--line)] px-4 py-4">
        <p className="font-medium">{run.provider ?? "Not recorded"}</p>
        <p className="mt-1 font-mono text-xs text-[var(--muted-ink)]">{run.model ?? "No model persisted"}</p>
        <p className="mt-1 text-xs text-[var(--muted-ink)]">{run.promptVersion ?? "No prompt version persisted"}</p>
      </td>
      <td className="border-b border-[var(--line)] px-4 py-4">
        {buildClaimHref(run) ? (
          <Link href={buildClaimHref(run)!} className="font-mono text-xs text-[var(--ink)] underline-offset-4 hover:underline">
            {run.claimId ?? "No claim"}
          </Link>
        ) : (
          <span className="font-mono text-xs text-[var(--muted-ink)]">{run.claimId ?? "No claim"}</span>
        )}
      </td>
      <td className="border-b border-[var(--line)] px-4 py-4">
        {buildRoundHref(run) ? (
          <Link href={buildRoundHref(run)!} className="font-mono text-xs text-[var(--ink)] underline-offset-4 hover:underline">
            {run.roundId ?? "No round"}
          </Link>
        ) : (
          <span className="font-mono text-xs text-[var(--muted-ink)]">{run.roundId ?? "No round"}</span>
        )}
      </td>
      <td className="border-b border-[var(--line)] px-4 py-4">
        <p className="font-mono text-xs text-[var(--ink)]">{run.userId}</p>
        <p className="mt-2 font-mono text-[11px] text-[var(--muted-ink)]">{run.requestId ?? "No request id"}</p>
      </td>
      <td className="border-b border-[var(--line)] px-4 py-4">
        <p className="font-mono text-[11px] text-[var(--ink)]">{run.traceId ?? "No trace id"}</p>
        <p className="mt-2 font-mono text-[11px] text-[var(--muted-ink)]">{run.observationId ?? "No observation id"}</p>
      </td>
      <td className="border-b border-[var(--line)] px-4 py-4 text-xs leading-6 text-[var(--muted-ink)]">
        {run.status === "generated"
          ? "No validation failure was recorded for this persisted critique."
          : "Pending requests do not yet have a persisted validation outcome."}
      </td>
    </tr>
  );
}

function StatusBadge({ status }: { status: InternalAiRunRecord["status"] }) {
  const label = status === "requested" ? "pending" : "success";
  const className =
    status === "requested"
      ? "border-[#d9b77d] bg-[#fff7e6] text-[#7b5a1a]"
      : "border-[#a9c8b6] bg-[#eef8f2] text-[#23533f]";

  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${className}`}>{label}</span>;
}

function buildStatusHref(query: InternalAiRunsAdminProps["query"], status: AdminAiRunStatusView) {
  const params = new URLSearchParams();

  setIfPresent(params, "provider", query.provider);
  setIfPresent(params, "model", query.model);
  setIfPresent(params, "prompt_version", query.promptVersion);
  setIfPresent(params, "user_id", query.userId);
  setIfPresent(params, "claim_id", query.claimId);
  setIfPresent(params, "round_id", query.roundId);
  setIfPresent(params, "date_from", query.dateFrom);
  setIfPresent(params, "date_to", query.dateTo);
  setIfPresent(params, "limit", query.limit);
  if (status !== "all") {
    params.set("status", status);
  }

  const suffix = params.toString();
  return suffix.length ? `/internal/ai-runs?${suffix}` : "/internal/ai-runs";
}

function buildClaimHref(run: InternalAiRunRecord) {
  if (!run.mapId || !run.claimId) {
    return null;
  }

  const params = new URLSearchParams({
    claimId: run.claimId,
  });

  return `/app/maps/${run.mapId}?${params.toString()}`;
}

function buildRoundHref(run: InternalAiRunRecord) {
  if (!run.mapId || !run.claimId || !run.roundId) {
    return null;
  }

  const params = new URLSearchParams({
    claimId: run.claimId,
    mode: "challenge",
    roundId: run.roundId,
  });

  return `/app/maps/${run.mapId}?${params.toString()}`;
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function setIfPresent(params: URLSearchParams, key: string, value: string) {
  if (value.trim().length) {
    params.set(key, value);
  }
}
