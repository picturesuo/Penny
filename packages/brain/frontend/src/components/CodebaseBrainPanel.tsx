import { useEffect, useState } from "react";
import { fetchCodebaseAudit, ingestCodebase, searchCodebase } from "../api/brainClient";
import type { CodebaseAuditResponse, CodebaseSearchResult } from "../types/brain";

export function CodebaseBrainPanel() {
  const [audit, setAudit] = useState<CodebaseAuditResponse["data"] | null>(null);
  const [results, setResults] = useState<CodebaseSearchResult[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("Loading");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void refreshAudit();
  }, []);

  async function refreshAudit() {
    setBusy(true);
    setStatus("Loading");

    try {
      const payload = await fetchCodebaseAudit();
      setAudit(payload.data);
      setStatus(payload.data.latestScan ? "Ready" : "No scan");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleIngest() {
    setBusy(true);
    setStatus("Scanning");

    try {
      await ingestCodebase();
      await refreshAudit();
      setStatus("Scan complete");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
      setBusy(false);
    }
  }

  async function handleSearch() {
    const trimmed = query.trim();

    if (!trimmed) {
      setResults([]);
      return;
    }

    setBusy(true);
    setStatus("Searching");

    try {
      const payload = await searchCodebase(trimmed);
      setResults(payload.data.results);
      setStatus(`${payload.data.meta.resultCount} results`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  const latestScan = audit?.latestScan ?? null;

  return (
    <main className="min-h-screen bg-[#f7f1e8] px-5 py-5 text-[#111]">
      <div className="mx-auto grid max-w-6xl gap-5">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-black/20 pb-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-black/50">Dev</p>
            <h1 className="text-3xl font-bold leading-tight">Codebase Brain</h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-black/60">{status}</span>
            <button
              className="rounded-md border border-black bg-[#eff7d2] px-3 py-2 text-sm font-bold shadow-[2px_2px_0_#111] disabled:opacity-50"
              disabled={busy}
              onClick={handleIngest}
              type="button"
            >
              Scan
            </button>
          </div>
        </header>

        <section className="grid gap-3 md:grid-cols-4">
          <Metric label="Last scan" value={latestScan?.completedAt ? new Date(latestScan.completedAt).toLocaleString() : "None"} />
          <Metric label="Files" value={latestScan?.fileCount ?? 0} />
          <Metric label="Chunks" value={latestScan?.chunkCount ?? 0} />
          <Metric label="Stale" value={latestScan?.staleFileCount ?? 0} />
        </section>

        <section className="grid gap-3 border-y border-black/15 py-4">
          <div className="flex flex-col gap-2 md:flex-row">
            <input
              className="min-h-11 flex-1 rounded-md border border-black/25 bg-transparent px-3 text-base outline-none focus:border-black"
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  void handleSearch();
                }
              }}
              placeholder="Search files, routes, components, tests, docs, symbols"
              value={query}
            />
            <button
              className="rounded-md border border-black bg-black px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
              disabled={busy}
              onClick={handleSearch}
              type="button"
            >
              Search
            </button>
          </div>

          <div className="grid gap-3">
            {results.map((result) => (
              <article className="rounded-md border border-black/15 p-3" key={result.chunkId}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-base font-bold">{result.title}</h2>
                  <span className="text-xs text-black/55">
                    {result.path}:{result.lineStart}
                  </span>
                </div>
                <p className="mt-1 text-sm text-black/70">{result.snippet}</p>
                <p className="mt-2 text-xs uppercase tracking-[0.18em] text-black/45">{result.reasons.join(" / ")}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-2">
          <ListBlock title="Stale files" items={audit?.staleFiles ?? []} />
          <ListBlock title="Top findings" items={(audit?.topFindings ?? []).map((finding) => `${finding.severity}: ${finding.title}`)} />
        </section>
      </div>
    </main>
  );
}

function Metric(props: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-black/15 p-3">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-black/45">{props.label}</p>
      <p className="mt-1 text-2xl font-bold">{props.value}</p>
    </div>
  );
}

function ListBlock(props: { title: string; items: string[] }) {
  return (
    <div className="rounded-md border border-black/15 p-3">
      <h2 className="text-sm font-bold uppercase tracking-[0.18em] text-black/50">{props.title}</h2>
      {props.items.length === 0 ? (
        <p className="mt-3 text-sm text-black/55">None</p>
      ) : (
        <ul className="mt-3 grid gap-2 text-sm">
          {props.items.slice(0, 8).map((item) => (
            <li className="break-words border-b border-black/10 pb-2 last:border-b-0 last:pb-0" key={item}>
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
