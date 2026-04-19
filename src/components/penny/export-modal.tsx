"use client";

import { useMemo, useState } from "react";
import { Download, FileText, Lock, Table2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { ExportFormat, ExportType } from "@/types/thought-map";

const EXPORT_TYPES: Array<{ id: ExportType; label: string; description: string }> = [
  {
    id: "single_map",
    label: "Single map",
    description: "Export one map with claims, history, artifacts, shapes, sessions, and calibration context.",
  },
  {
    id: "all_maps",
    label: "All maps",
    description: "Export every map for this user in the open JSON schema.",
  },
  {
    id: "single_claim",
    label: "Single claim",
    description: "Export one claim and its surrounding map context.",
  },
  {
    id: "calibration_data",
    label: "Calibration data",
    description: "Export calibration, bias profile, and blind spot records.",
  },
  {
    id: "session_history",
    label: "Session history",
    description: "Export one session or all sessions for this user.",
  },
  {
    id: "shapes_and_lens",
    label: "Shapes and lens",
    description: "Export the detected shapes and lens snapshots for the user’s maps.",
  },
  {
    id: "full_data",
    label: "Full data",
    description: "Export maps, sessions, and calibration records together.",
  },
];

const EXPORT_FORMATS: Array<{ id: ExportFormat; label: string; description: string }> = [
  { id: "json", label: "JSON", description: "Machine-readable open schema." },
  { id: "markdown", label: "Markdown", description: "Readable archive for maps and summaries." },
  { id: "csv", label: "CSV", description: "Tabular export for spreadsheet tools." },
];

export interface ExportModalProps {
  open: boolean;
  userId: string;
  mapId?: string | null;
  mapTitle?: string | null;
  claimId?: string | null;
  claimLabel?: string | null;
  sessionId?: string | null;
  onClose: () => void;
}

export function ExportModal({
  open,
  userId,
  mapId,
  mapTitle,
  claimId,
  claimLabel,
  sessionId,
  onClose,
}: ExportModalProps) {
  const [exportType, setExportType] = useState<ExportType>("single_map");
  const [format, setFormat] = useState<ExportFormat>("json");
  const [includeHistory, setIncludeHistory] = useState(true);
  const [includePrivate, setIncludePrivate] = useState(false);
  const [manualMapId, setManualMapId] = useState(mapId ?? "");
  const [manualClaimId, setManualClaimId] = useState(claimId ?? "");
  const [manualSessionId, setManualSessionId] = useState(sessionId ?? "");
  const [error, setError] = useState<string | null>(null);

  const requiresMapId = exportType === "single_map" || exportType === "single_claim" || exportType === "shapes_and_lens";
  const requiresClaimId = exportType === "single_claim";
  const needsSessionFilter = exportType === "session_history";

  const effectiveMapId = (mapId ?? manualMapId).trim();
  const effectiveClaimId = (claimId ?? manualClaimId).trim();
  const effectiveSessionId = (sessionId ?? manualSessionId).trim();

  const canDownload = useMemo(() => {
    if (requiresMapId && !effectiveMapId) {
      return false;
    }

    if (requiresClaimId && !effectiveClaimId) {
      return false;
    }

    return true;
  }, [effectiveClaimId, effectiveMapId, requiresClaimId, requiresMapId]);

  if (!open) {
    return null;
  }

  function buildDownloadUrl() {
    const url = new URL(`/api/users/${userId}/export`, window.location.origin);
    url.searchParams.set("exportType", exportType);
    url.searchParams.set("format", format);
    url.searchParams.set("includeHistory", String(includeHistory));
    url.searchParams.set("includePrivate", String(includePrivate));

    if (effectiveMapId) {
      url.searchParams.set("mapId", effectiveMapId);
    }

    if (effectiveClaimId) {
      url.searchParams.set("claimId", effectiveClaimId);
    }

    if (effectiveSessionId) {
      url.searchParams.set("sessionId", effectiveSessionId);
    }

    return url.toString();
  }

  function downloadExport() {
    if (!canDownload) {
      setError("Add the missing target id before downloading this export.");
      return;
    }

    const url = buildDownloadUrl();
    window.location.assign(url);
    setError(null);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-8">
      <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-[28px] border border-black/8 bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted-ink)]">Export</p>
            <h3 className="mt-2 text-2xl font-semibold text-[var(--ink)]">Export Penny data in an open format</h3>
            <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">
              Your data is yours. You can export everything at any time in an open format. We will maintain the schema
              documentation publicly. You can import your data into any tool that accepts this format.
            </p>
          </div>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <Card className="border border-black/8 p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Export target</p>
                <h4 className="mt-1 text-lg font-semibold text-[var(--ink)]">What do you want to export?</h4>
              </div>
              <Download className="size-5 text-[var(--ink)]" />
            </div>

            <div className="mt-4 space-y-3">
              <label className="block text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">
                Export type
                <select
                  className="mt-2 w-full rounded-[16px] border border-black/10 bg-white px-3 py-2 text-sm text-[var(--ink)] outline-none"
                  value={exportType}
                  onChange={(event) => {
                    setExportType(event.target.value as ExportType);
                    setError(null);
                  }}
                >
                  {EXPORT_TYPES.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.label}
                    </option>
                  ))}
                </select>
              </label>

              <div className="rounded-[20px] bg-[var(--panel)] p-4">
                <p className="text-sm font-medium text-[var(--ink)]">
                  {EXPORT_TYPES.find((entry) => entry.id === exportType)?.label ?? "Export"}
                </p>
                <p className="mt-1 text-sm leading-6 text-[var(--muted-ink)]">
                  {EXPORT_TYPES.find((entry) => entry.id === exportType)?.description}
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="block text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">
                  Format
                  <select
                    className="mt-2 w-full rounded-[16px] border border-black/10 bg-white px-3 py-2 text-sm text-[var(--ink)] outline-none"
                    value={format}
                    onChange={(event) => {
                      setFormat(event.target.value as ExportFormat);
                      setError(null);
                    }}
                  >
                    {EXPORT_FORMATS.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.label}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="rounded-[16px] border border-black/8 bg-white px-3 py-3">
                  <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Format notes</p>
                  <p className="mt-1 text-sm leading-6 text-[var(--muted-ink)]">
                    {EXPORT_FORMATS.find((entry) => entry.id === format)?.description}
                  </p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="flex items-center justify-between rounded-[18px] border border-black/8 bg-white px-4 py-3 text-sm text-[var(--ink)]">
                  <span>
                    <span className="block font-medium">Include history</span>
                    <span className="block text-xs text-[var(--muted-ink)]">Events, rounds, and prior versions.</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={includeHistory}
                    onChange={(event) => setIncludeHistory(event.target.checked)}
                  />
                </label>

                <label className="flex items-center justify-between rounded-[18px] border border-black/8 bg-white px-4 py-3 text-sm text-[var(--ink)]">
                  <span>
                    <span className="block font-medium">Include private fields</span>
                    <span className="block text-xs text-[var(--muted-ink)]">Raw notes, conversation, and source text.</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={includePrivate}
                    onChange={(event) => setIncludePrivate(event.target.checked)}
                  />
                </label>
              </div>

              {requiresMapId && !mapId ? (
                <label className="block text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">
                  Map id
                  <input
                    className="mt-2 w-full rounded-[16px] border border-black/10 bg-white px-3 py-2 text-sm text-[var(--ink)] outline-none"
                    value={manualMapId}
                    onChange={(event) => setManualMapId(event.target.value)}
                    placeholder="Paste a map id"
                  />
                </label>
              ) : null}

              {requiresClaimId ? (
                <label className="block text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">
                  Claim id
                  <input
                    className="mt-2 w-full rounded-[16px] border border-black/10 bg-white px-3 py-2 text-sm text-[var(--ink)] outline-none"
                    value={manualClaimId}
                    onChange={(event) => setManualClaimId(event.target.value)}
                    placeholder="Paste a claim id"
                  />
                </label>
              ) : null}

              {needsSessionFilter ? (
                <label className="block text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">
                  Session id
                  <input
                    className="mt-2 w-full rounded-[16px] border border-black/10 bg-white px-3 py-2 text-sm text-[var(--ink)] outline-none"
                    value={manualSessionId}
                    onChange={(event) => setManualSessionId(event.target.value)}
                    placeholder="Optional: export one session"
                  />
                </label>
              ) : null}

              <div className="flex flex-wrap gap-3 pt-2">
                <Button className="gap-2" onClick={downloadExport} disabled={!canDownload}>
                  <Download className="size-4" />
                  Download export
                </Button>
                <Button
                  variant="secondary"
                  className="gap-2"
                  onClick={() => {
                    const clipboard = navigator.clipboard;
                    if (clipboard) {
                      clipboard.writeText(buildDownloadUrl()).catch(() => {});
                    }
                  }}
                  disabled={!canDownload}
                >
                  Copy URL
                </Button>
              </div>

              {error ? <p className="text-sm leading-6 text-[#8b4d1f]">{error}</p> : null}
            </div>
          </Card>

          <div className="space-y-4">
            <Card className="border border-black/8 p-5">
              <div className="flex items-center gap-3">
                <FileText className="size-5 text-[var(--ink)]" />
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Preview</p>
                  <h4 className="text-lg font-semibold text-[var(--ink)]">
                    {mapTitle ?? claimLabel ?? "Selected export"}
                  </h4>
                </div>
              </div>
              <div className="mt-4 space-y-3 text-sm leading-6 text-[var(--muted-ink)]">
                <p>
                  {exportType === "single_map"
                    ? "Exports one map, including its claims, artifacts, and linked sessions."
                    : exportType === "single_claim"
                      ? "Exports one claim and the surrounding map context."
                      : exportType === "all_maps"
                        ? "Exports every map for the current user."
                        : exportType === "session_history"
                          ? "Exports session records with the option to narrow to one session."
                          : exportType === "shapes_and_lens"
                            ? "Exports the detected shapes and lens snapshots for the selected maps."
                            : exportType === "calibration_data"
                              ? "Exports calibration and bias surfaces."
                              : "Exports maps, sessions, and calibration together."}
                </p>
                <div className="flex flex-wrap gap-2">
                  <span className="inline-flex items-center gap-2 rounded-full border border-black/8 bg-[var(--panel)] px-3 py-1 text-xs uppercase tracking-[0.16em] text-[var(--ink)]">
                    <Table2 className="size-3.5" />
                    Open schema
                  </span>
                  <span className="inline-flex items-center gap-2 rounded-full border border-black/8 bg-[var(--panel)] px-3 py-1 text-xs uppercase tracking-[0.16em] text-[var(--ink)]">
                    <Lock className="size-3.5" />
                    Portable
                  </span>
                </div>
              </div>
            </Card>

            <Card className="border border-black/8 p-5">
              <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Portability guarantee</p>
              <p className="mt-2 text-sm leading-6 text-[var(--ink)]">
                Penny will keep the schema documentation public and versioned. The export is designed so you can move
                it into another tool without needing Penny to interpret it first.
              </p>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
