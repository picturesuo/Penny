import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { InternalAiRunsAdmin, type AdminAiRunStatusView } from "@/components/penny/internal-ai-runs-admin";
import { listInternalAiRuns, parseInternalAiRunFilters } from "@/server/internal-ai-runs";
import type { InternalAiRunsResponse } from "@/types/ai-runs";

export const dynamic = "force-dynamic";

const INTERNAL_ADMIN_API_KEY_ENV = "PENNY_INTERNAL_ADMIN_API_KEY";
const INTERNAL_ADMIN_COOKIE = "penny_internal_admin_key";

type InternalAiRunsPageSearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function InternalAiRunsPage(props: { searchParams: InternalAiRunsPageSearchParams }) {
  const query = await props.searchParams;
  const authState = firstQueryValue(query.auth);
  const configuredKey = process.env[INTERNAL_ADMIN_API_KEY_ENV] ?? "";
  const cookieStore = await cookies();
  const authorized = configuredKey.length > 0 && cookieStore.get(INTERNAL_ADMIN_COOKIE)?.value === configuredKey;

  if (!configuredKey.length) {
    return (
      <main className="min-h-screen bg-[linear-gradient(180deg,#faf7f3_0%,#f4efe8_100%)] px-6 py-10 text-[var(--ink)] lg:px-10">
        <section className="mx-auto max-w-3xl rounded-[28px] border border-[#d9b77d] bg-[#fff7e6] px-6 py-6 shadow-[0_10px_30px_rgba(38,30,25,0.04)]">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#7b5a1a]">Internal Admin</p>
          <h1 className="mt-3 font-display text-4xl leading-none text-[#5e4311]">AI Runs</h1>
          <p className="mt-4 text-sm leading-7 text-[#7b5a1a]">
            This internal admin page is configured, but the environment variable `{INTERNAL_ADMIN_API_KEY_ENV}` is missing.
            Set the key before using this support surface.
          </p>
        </section>
      </main>
    );
  }

  if (!authorized) {
    return (
      <main className="min-h-screen bg-[linear-gradient(180deg,#faf7f3_0%,#f4efe8_100%)] px-6 py-10 text-[var(--ink)] lg:px-10">
        <section className="mx-auto max-w-lg rounded-[28px] border border-[var(--line)] bg-[rgba(255,255,255,0.88)] px-6 py-6 shadow-[0_10px_30px_rgba(38,30,25,0.04)]">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--muted-ink)]">Internal Admin</p>
          <h1 className="mt-3 font-display text-4xl leading-none text-[var(--ink)]">AI Runs</h1>
          <p className="mt-4 text-sm leading-7 text-[var(--muted-ink)]">
            This page is read-only support tooling. Enter the internal admin key to inspect persisted challenge AI runs.
          </p>

          {authState === "invalid" ? (
            <div className="mt-5 rounded-[18px] border border-[#d7a3a3] bg-[#fff2f2] px-4 py-3 text-sm text-[#7d2e2e]">
              The provided admin key was invalid.
            </div>
          ) : null}

          <form action={authorizeInternalAccess} className="mt-6 space-y-4">
            <label className="flex flex-col gap-2 text-sm text-[var(--muted-ink)]">
              Internal admin key
              <input
                type="password"
                name="access_key"
                required
                className="rounded-[16px] border border-[var(--line)] bg-white px-3 py-2.5 text-[var(--ink)] outline-none transition focus:border-[var(--ink)]"
              />
            </label>

            <button
              type="submit"
              className="rounded-full bg-[var(--ink)] px-5 py-2.5 text-sm font-medium text-white transition hover:opacity-92"
            >
              Unlock admin page
            </button>
          </form>
        </section>
      </main>
    );
  }

  const statusView = parseStatusView(firstQueryValue(query.status));
  const backendQuery = buildBackendQuery(query, statusView);
  const parsedFilters = parseInternalAiRunFilters(backendQuery);
  const baseResponse = await listInternalAiRuns(parsedFilters);
  const unsupportedStatusMessage = getUnsupportedStatusMessage(statusView);
  const response: InternalAiRunsResponse = unsupportedStatusMessage
    ? {
        ...baseResponse,
        runs: [],
        meta: {
          ...baseResponse.meta,
          count: 0,
        },
      }
    : baseResponse;

  const apiHref = buildApiHref(backendQuery);

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#faf7f3_0%,#f4efe8_100%)] text-[var(--ink)]">
      <div className="flex justify-end px-6 pt-6 lg:px-10">
        <form action={clearInternalAccess}>
          <button
            type="submit"
            className="rounded-full border border-[var(--line)] bg-white px-4 py-2 text-sm text-[var(--muted-ink)] transition hover:border-[var(--ink)] hover:text-[var(--ink)]"
          >
            Lock page
          </button>
        </form>
      </div>

      <InternalAiRunsAdmin
        apiHref={apiHref}
        query={{
          provider: firstQueryValue(query.provider),
          model: firstQueryValue(query.model),
          promptVersion: firstQueryValue(query.prompt_version),
          userId: firstQueryValue(query.user_id),
          claimId: firstQueryValue(query.claim_id),
          roundId: firstQueryValue(query.round_id),
          dateFrom: firstQueryValue(query.date_from),
          dateTo: firstQueryValue(query.date_to),
          limit: firstQueryValue(query.limit) || String(response.meta.limit),
          status: statusView,
        }}
        response={response}
        unsupportedStatusMessage={unsupportedStatusMessage}
      />
    </main>
  );
}

async function authorizeInternalAccess(formData: FormData) {
  "use server";

  const configuredKey = process.env[INTERNAL_ADMIN_API_KEY_ENV] ?? "";
  const suppliedKey = String(formData.get("access_key") ?? "").trim();

  if (!configuredKey.length || suppliedKey !== configuredKey) {
    redirect("/internal/ai-runs?auth=invalid");
  }

  const cookieStore = await cookies();
  cookieStore.set({
    name: INTERNAL_ADMIN_COOKIE,
    value: suppliedKey,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });

  redirect("/internal/ai-runs");
}

async function clearInternalAccess() {
  "use server";

  const cookieStore = await cookies();
  cookieStore.delete(INTERNAL_ADMIN_COOKIE);
  redirect("/internal/ai-runs");
}

function parseStatusView(value: string): AdminAiRunStatusView {
  switch (value) {
    case "pending":
    case "success":
    case "failed":
    case "validation_failed":
      return value;
    default:
      return "all";
  }
}

function buildBackendQuery(
  searchParams: Awaited<InternalAiRunsPageSearchParams>,
  statusView: AdminAiRunStatusView,
) {
  const params = new URLSearchParams();

  setIfPresent(params, "provider", firstQueryValue(searchParams.provider));
  setIfPresent(params, "model", firstQueryValue(searchParams.model));
  setIfPresent(params, "prompt_version", firstQueryValue(searchParams.prompt_version));
  setIfPresent(params, "user_id", firstQueryValue(searchParams.user_id));
  setIfPresent(params, "claim_id", firstQueryValue(searchParams.claim_id));
  setIfPresent(params, "round_id", firstQueryValue(searchParams.round_id));
  setIfPresent(params, "date_from", firstQueryValue(searchParams.date_from));
  setIfPresent(params, "date_to", firstQueryValue(searchParams.date_to));
  setIfPresent(params, "limit", firstQueryValue(searchParams.limit));

  if (statusView === "pending") {
    params.set("status", "requested");
  }

  if (statusView === "success") {
    params.set("status", "generated");
  }

  return params;
}

function buildApiHref(params: URLSearchParams) {
  const suffix = params.toString();
  return suffix.length ? `/api/internal/ai-runs?${suffix}` : "/api/internal/ai-runs";
}

function getUnsupportedStatusMessage(statusView: AdminAiRunStatusView) {
  if (statusView === "failed") {
    return "The current ai_runs read model does not persist backend execution failures yet, so this view cannot show evidence-backed failure rows.";
  }

  if (statusView === "validation_failed") {
    return "The current ai_runs read model does not persist schema-validation failures or their reasons yet, so this view cannot show evidence-backed validation failure rows.";
  }

  return null;
}

function firstQueryValue(value: string | string[] | undefined) {
  return typeof value === "string" ? value : Array.isArray(value) ? value[0] ?? "" : "";
}

function setIfPresent(params: URLSearchParams, key: string, value: string) {
  if (value.trim().length) {
    params.set(key, value);
  }
}
