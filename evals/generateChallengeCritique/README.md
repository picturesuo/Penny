# `generateChallengeCritique` Golden Dataset

This folder holds offline evaluation fixtures for Penny's `generateChallengeCritique` operation.

## Folder structure

```text
evals/generateChallengeCritique/
  README.md
  schema.ts
  datasets/
    golden-v1.json
  results/
    .gitkeep

src/scripts/
  replay-generate-challenge-critique.ts
```

## What lives here

- `schema.ts`: the golden dataset schema. It reuses the live production Zod input and output schemas so fixture drift is easier to detect.
- `datasets/golden-v1.json`: example golden dataset entries for offline checks.
- `results/`: reserved for local evaluation outputs. It is intentionally outside production write paths.
- `src/scripts/replay-generate-challenge-critique.ts`: replay CLI for running stored inputs against one or more providers and prompt versions.

## Dataset shape

Each dataset file contains:

- `dataset_id`
- `operation`
- `description`
- `metadata`
  - `dataset_version`
  - `prompt_version`
  - `schema_version`
  - `created_at`
  - `labels`
  - `human_notes`
- `entries`

Each entry contains:

- `id`
- `operation`
- `metadata`
  - `prompt_version`
  - `schema_version`
  - `source`
  - `labels`
  - `human_notes`
- `input`
- `expected_output`

## Notes

- `input` mirrors the live `GenerateChallengeCritiqueInputSchema`.
- `expected_output` mirrors the live `GenerateChallengeCritiqueOutputSchema`.
- `prompt_version` and `schema_version` are carried at both dataset and entry level so mixed-version fixtures remain possible.
- `labels` and `human_notes` exist specifically for offline review, adjudication, and future rubric expansion.

## Replay CLI

Run the replay utility with `tsx` so results stay fully outside production data:

```bash
npx tsx src/scripts/replay-generate-challenge-critique.ts \
  --dataset evals/generateChallengeCritique/datasets/golden-v1.json \
  --providers anthropic,xai \
  --prompt-versions challenge-critique.v1 \
  --run-id local-check-001
```

Useful options:

- `--entry-ids distribution-advantage-market-quality`
- `--models anthropic=claude-sonnet-4-20250514,xai=grok-4.20`
- `--output-dir evals/generateChallengeCritique/results`
- `--dry-run`

## Replay output format

Each run writes to:

```text
evals/generateChallengeCritique/results/<run-id>/
  manifest.json
  entries/
    <entry-id>__<provider>__<model>__<prompt-version>.json
```

`manifest.json` contains the run summary and file list. Each per-entry replay file is pretty JSON and includes:

- `provider`
- `model`
- `prompt`
  - `prompt_version`
  - `system_prompt`
  - `user_prompt`
- `entry`
  - `id`
  - `input`
  - `expected_output`
  - `labels`
  - `notes`
- `replay`
  - `status`
  - `dry_run`
  - `started_at`
  - `finished_at`
  - `duration_ms`
  - `error`
- `output`
  - `actual_output`
  - `raw_output`
  - `usage`
  - `cost`
  - `validation_error`
- `comparison`
  - `exact_match`
  - `differing_fields`
  - `fields`

The per-entry file layout is intentionally diff-friendly: one replay result per file, pretty-printed JSON, and a field-by-field expected vs actual comparison.
