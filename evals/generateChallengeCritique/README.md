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
```

## What lives here

- `schema.ts`: the golden dataset schema. It reuses the live production Zod input and output schemas so fixture drift is easier to detect.
- `datasets/golden-v1.json`: example golden dataset entries for offline checks.
- `results/`: reserved for local evaluation outputs. It is intentionally outside production write paths.

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
