# Penny Export Schema

Schema version: `penny.export/v1`

Penny exports user data in open, human-readable formats:

- `json` for machine import
- `markdown` for readable archival copies of maps
- `csv` for spreadsheet tools

## Portability Guarantee

Your data is yours. You can export everything at any time in an open format. Penny will keep the schema documentation public so you can import your data into other tools.

## Export request

Each export request uses this shape:

```ts
ExportRequest {
  id: string
  userId: string
  exportType: "single_map" | "all_maps" | "single_claim" | "calibration_data" | "session_history" | "shapes_and_lens" | "full_data"
  format: "json" | "markdown" | "csv"
  includeHistory: boolean
  includePrivate: boolean
  requestedAt: Date
  completedAt: Date | null
  downloadUrl: string | null
  expiresAt: Date | null
  mapId?: string | null
  claimId?: string | null
  sessionId?: string | null
}
```

## JSON export structure

JSON exports are versioned and self-describing.

Top-level fields:

- `schemaVersion`
- `exportedAt`
- `request`
- `portabilityGuarantee`
- `userId`
- `maps`
- `sessions`
- `calibration`

### Map export

For `single_map`, `all_maps`, and `full_data`, each map snapshot includes:

- map metadata
- claims with full event history when `includeHistory` is true
- dialectic rounds
- shapes and derivation data
- artifacts and artifact outcomes
- import sources
- sessions tied to the map
- calibration context

### Claim export

For `single_claim`, the export contains:

- the selected claim
- the owning map
- the claim history when requested
- the relevant sessions and calibration context

### Calibration export

For `calibration_data`, the export contains:

- bias profile
- calibration coaching
- blind spot map
- calibration dashboard snapshot

### Session export

For `session_history`, the export contains:

- one session or all matching sessions
- session events
- closing ritual
- session summary

### Shapes and lens export

For `shapes_and_lens`, the export contains:

- shape summaries
- shape derivations
- Penny lens snapshots

## Markdown export structure

Markdown exports are intended to be readable five years later without software.

For a map export, the document includes:

- title and dates
- claims with confidence, provenance, and a prose summary of the history
- detected shapes
- generated artifacts
- calibration summary
- linked sessions

## CSV export structure

CSV exports flatten the map into rows for:

- maps
- claims
- artifacts
- sessions
- calibration records

CSV is intended for quick analysis in spreadsheet tools, not for round-tripping the full graph without JSON.

## Compatibility notes

- The schema version is stable and versioned.
- New fields should be added without breaking older exports.
- Older exports should remain importable as long as their schema version is supported.

