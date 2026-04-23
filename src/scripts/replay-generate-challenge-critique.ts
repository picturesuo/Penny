import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  GenerateChallengeCritiqueGoldenDatasetSchema,
  type GenerateChallengeCritiqueGoldenDataset,
  type GenerateChallengeCritiqueGoldenDatasetEntry,
} from "../../evals/generateChallengeCritique/schema";
import { GenerateChallengeCritiqueOutputSchema } from "@/server/ai/schemas/challengeCritique";

type ReplayProviderName = "anthropic" | "xai";
type ReplayStatus = "planned" | "succeeded" | "provider_failed" | "validation_failed";

type StructuredProviderRequest = {
  jsonSchema: Record<string, unknown>;
  maxTokens: number;
  model: string;
  schemaName: string;
  systemPrompt: string;
  temperature: number;
  userPrompt: string;
};

type StructuredProviderUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
};

type StructuredProviderCost = {
  currency: string | null;
  totalUsd: number | null;
};

type StructuredProviderResponse = {
  cost: StructuredProviderCost;
  output: unknown;
  usage: StructuredProviderUsage;
};

type ReplayPlan = {
  provider: ReplayProviderName;
  model: string;
  promptVersion: string;
};

type ReplayFileRecord = {
  comparison: {
    differing_fields: string[];
    exact_match: boolean;
    fields: Record<
      string,
      {
        actual: unknown;
        expected: unknown;
        matches: boolean;
      }
    >;
  };
  entry: {
    expected_output: GenerateChallengeCritiqueGoldenDatasetEntry["expected_output"];
    id: string;
    input: GenerateChallengeCritiqueGoldenDatasetEntry["input"];
    labels: string[];
    notes: string | null;
  };
  model: string;
  output: {
    actual_output: z.infer<typeof GenerateChallengeCritiqueOutputSchema> | null;
    cost: StructuredProviderCost | null;
    raw_output: unknown;
    usage: StructuredProviderUsage | null;
    validation_error: string | null;
  };
  prompt: {
    prompt_version: string;
    system_prompt: string;
    user_prompt: string;
  };
  provider: ReplayProviderName;
  replay: {
    dry_run: boolean;
    duration_ms: number;
    error: string | null;
    finished_at: string;
    started_at: string;
    status: ReplayStatus;
  };
};

type ReplayManifest = {
  dataset_id: string;
  dataset_path: string;
  dry_run: boolean;
  generated_at: string;
  output_dir: string;
  results: Array<{
    entry_id: string;
    file: string;
    model: string;
    prompt_version: string;
    provider: ReplayProviderName;
    status: ReplayStatus;
  }>;
  run_id: string;
};

type ParsedArgs = {
  datasetPath: string;
  dryRun: boolean;
  entryIds: string[] | null;
  modelsByProvider: Partial<Record<ReplayProviderName, string>>;
  outputDir: string;
  promptVersions: string[] | null;
  providers: ReplayProviderName[];
  runId: string;
};

const DEFAULT_DATASET_PATH = path.resolve("evals/generateChallengeCritique/datasets/golden-v1.json");
const DEFAULT_OUTPUT_DIR = path.resolve("evals/generateChallengeCritique/results");
const DEFAULT_MODELS: Record<ReplayProviderName, string> = {
  anthropic: process.env.ANTHROPIC_CHALLENGE_MODEL?.trim() || "claude-sonnet-4-20250514",
  xai: process.env.XAI_CHALLENGE_FALLBACK_MODEL?.trim() || "grok-4.20",
};
const DEFAULT_MAX_TOKENS: Record<ReplayProviderName, number> = {
  anthropic: 1800,
  xai: 1800,
};
const DEFAULT_TEMPERATURE: Record<ReplayProviderName, number> = {
  anthropic: 0.2,
  xai: 0.2,
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dataset = await loadDataset(args.datasetPath);
  const entries = selectEntries(dataset, args.entryIds);
  const plans = buildReplayPlans(entries, args);
  const runDir = path.join(args.outputDir, args.runId);

  await mkdir(runDir, { recursive: true });
  await mkdir(path.join(runDir, "entries"), { recursive: true });

  const manifest: ReplayManifest = {
    run_id: args.runId,
    dataset_id: dataset.dataset_id,
    dataset_path: path.relative(process.cwd(), args.datasetPath),
    dry_run: args.dryRun,
    generated_at: new Date().toISOString(),
    output_dir: path.relative(process.cwd(), runDir),
    results: [],
  };

  for (const { entry, plan } of plans) {
    const record = await replayEntry(entry, plan, args.dryRun);
    const filename = buildReplayFilename(entry.id, plan.provider, plan.model, plan.promptVersion);
    const outputPath = path.join(runDir, "entries", filename);
    await writePrettyJson(outputPath, record);
    manifest.results.push({
      entry_id: entry.id,
      provider: plan.provider,
      model: plan.model,
      prompt_version: plan.promptVersion,
      status: record.replay.status,
      file: path.relative(process.cwd(), outputPath),
    });
  }

  await writePrettyJson(path.join(runDir, "manifest.json"), manifest);

  console.log(
    JSON.stringify(
      {
        run_id: manifest.run_id,
        dataset_id: manifest.dataset_id,
        dry_run: manifest.dry_run,
        results: manifest.results.length,
        output_dir: manifest.output_dir,
      },
      null,
      2,
    ),
  );
}

function parseArgs(argv: string[]): ParsedArgs {
  if (argv.includes("--help") || argv.includes("-h")) {
    printUsageAndExit(0);
  }

  const getOption = (name: string) => {
    const index = argv.indexOf(name);
    if (index === -1) {
      return null;
    }

    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for ${name}.`);
    }

    return value;
  };

  const datasetPath = path.resolve(getOption("--dataset") ?? DEFAULT_DATASET_PATH);
  const outputDir = path.resolve(getOption("--output-dir") ?? DEFAULT_OUTPUT_DIR);
  const providers = parseProviders(getOption("--providers"));
  const entryIds = splitCsv(getOption("--entry-ids"));
  const promptVersions = splitCsv(getOption("--prompt-versions"));
  const modelsByProvider = parseProviderModelOverrides(getOption("--models"));
  const runId = getOption("--run-id") ?? createRunId();
  const dryRun = argv.includes("--dry-run");

  return {
    datasetPath,
    outputDir,
    providers,
    entryIds,
    promptVersions,
    modelsByProvider,
    runId,
    dryRun,
  };
}

function printUsageAndExit(code: number): never {
  const usage = [
    "Usage:",
    "  npx tsx src/scripts/replay-generate-challenge-critique.ts [options]",
    "",
    "Options:",
    `  --dataset <path>           Dataset JSON path. Default: ${DEFAULT_DATASET_PATH}`,
    "  --providers <csv>         Providers to replay against: anthropic,xai",
    "  --prompt-versions <csv>   Prompt versions to replay, e.g. challenge-critique.v1",
    "  --entry-ids <csv>         Optional dataset entry ids to replay",
    "  --models <csv>            Provider model overrides, e.g. anthropic=claude-sonnet-4-20250514,xai=grok-4.20",
    `  --output-dir <path>       Replay output directory. Default: ${DEFAULT_OUTPUT_DIR}`,
    "  --run-id <id>             Stable run id for the output folder",
    "  --dry-run                 Validate and write planned output without calling providers",
    "  --help                    Show this message",
  ].join("\n");

  console.log(usage);
  process.exit(code);
}

async function loadDataset(datasetPath: string): Promise<GenerateChallengeCritiqueGoldenDataset> {
  const raw = await readFile(datasetPath, "utf8");
  return GenerateChallengeCritiqueGoldenDatasetSchema.parse(JSON.parse(raw));
}

function selectEntries(
  dataset: GenerateChallengeCritiqueGoldenDataset,
  entryIds: string[] | null,
) {
  if (!entryIds?.length) {
    return dataset.entries;
  }

  const selected = dataset.entries.filter((entry) => entryIds.includes(entry.id));
  if (!selected.length) {
    throw new Error(`No dataset entries matched entry ids: ${entryIds.join(", ")}`);
  }

  return selected;
}

function buildReplayPlans(entries: GenerateChallengeCritiqueGoldenDataset["entries"], args: ParsedArgs) {
  return entries.flatMap((entry) => {
    const promptVersions = args.promptVersions?.length
      ? args.promptVersions
      : [entry.metadata.prompt_version || "challenge-critique.v1"];

    return args.providers.flatMap((provider) =>
      promptVersions.map((promptVersion) => ({
        entry,
        plan: {
          provider,
          model: args.modelsByProvider[provider] ?? DEFAULT_MODELS[provider],
          promptVersion,
        } satisfies ReplayPlan,
      })),
    );
  });
}

async function replayEntry(
  entry: GenerateChallengeCritiqueGoldenDatasetEntry,
  plan: ReplayPlan,
  dryRun: boolean,
): Promise<ReplayFileRecord> {
  const prompt = buildPrompt(entry, plan.promptVersion);
  const startedAt = new Date();
  const baseRecord = {
    provider: plan.provider,
    model: plan.model,
    prompt: {
      prompt_version: plan.promptVersion,
      system_prompt: prompt.systemPrompt,
      user_prompt: prompt.userPrompt,
    },
    entry: {
      id: entry.id,
      input: entry.input,
      expected_output: entry.expected_output,
      labels: entry.metadata.labels,
      notes: entry.metadata.human_notes,
    },
  };

  if (dryRun) {
    const finishedAt = new Date();
    return {
      ...baseRecord,
      replay: {
        dry_run: true,
        status: "planned",
        error: null,
        duration_ms: finishedAt.getTime() - startedAt.getTime(),
        started_at: startedAt.toISOString(),
        finished_at: finishedAt.toISOString(),
      },
      output: {
        actual_output: null,
        raw_output: null,
        usage: null,
        cost: null,
        validation_error: null,
      },
      comparison: createComparison(entry.expected_output, null),
    };
  }

  try {
    const providerResponse = await invokeProvider(plan.provider, {
      model: plan.model,
      maxTokens: DEFAULT_MAX_TOKENS[plan.provider],
      temperature: DEFAULT_TEMPERATURE[plan.provider],
      schemaName: "generateChallengeCritique",
      jsonSchema: toProviderJsonSchema(GenerateChallengeCritiqueOutputSchema),
      systemPrompt: prompt.systemPrompt,
      userPrompt: prompt.userPrompt,
    });

    const finishedAt = new Date();

    try {
      const actualOutput = GenerateChallengeCritiqueOutputSchema.parse(providerResponse.output);
      return {
        ...baseRecord,
        replay: {
          dry_run: false,
          status: "succeeded",
          error: null,
          duration_ms: finishedAt.getTime() - startedAt.getTime(),
          started_at: startedAt.toISOString(),
          finished_at: finishedAt.toISOString(),
        },
        output: {
          actual_output: actualOutput,
          raw_output: providerResponse.output,
          usage: providerResponse.usage,
          cost: providerResponse.cost,
          validation_error: null,
        },
        comparison: createComparison(entry.expected_output, actualOutput),
      };
    } catch (error) {
      const validationError = error instanceof Error ? error.message : String(error);
      return {
        ...baseRecord,
        replay: {
          dry_run: false,
          status: "validation_failed",
          error: validationError,
          duration_ms: finishedAt.getTime() - startedAt.getTime(),
          started_at: startedAt.toISOString(),
          finished_at: finishedAt.toISOString(),
        },
        output: {
          actual_output: null,
          raw_output: providerResponse.output,
          usage: providerResponse.usage,
          cost: providerResponse.cost,
          validation_error: validationError,
        },
        comparison: createComparison(entry.expected_output, null),
      };
    }
  } catch (error) {
    const finishedAt = new Date();
    const message = error instanceof Error ? error.message : String(error);

    return {
      ...baseRecord,
      replay: {
        dry_run: false,
        status: "provider_failed",
        error: message,
        duration_ms: finishedAt.getTime() - startedAt.getTime(),
        started_at: startedAt.toISOString(),
        finished_at: finishedAt.toISOString(),
      },
      output: {
        actual_output: null,
        raw_output: null,
        usage: null,
        cost: null,
        validation_error: null,
      },
      comparison: createComparison(entry.expected_output, null),
    };
  }
}

function buildPrompt(entry: GenerateChallengeCritiqueGoldenDatasetEntry, promptVersion: string) {
  switch (promptVersion) {
    case "challenge-critique.v1":
    case "generateChallengeCritique.v1":
      return buildPromptV1(entry.input);
    default:
      throw new Error(
        `Unsupported prompt version "${promptVersion}". Supported versions: challenge-critique.v1, generateChallengeCritique.v1`,
      );
  }
}

function buildPromptV1(input: GenerateChallengeCritiqueGoldenDatasetEntry["input"]) {
  return {
    systemPrompt:
      "You generate one rigorous challenge critique for Penny, a pressure-tested second brain. Be concise, specific, and high-signal. Prefer structural pressure over vague skepticism. Output only valid JSON that matches the requested schema.",
    userPrompt: [
      `Map title: ${input.mapTitle}`,
      `Claim id: ${input.claimId}`,
      `Claim: ${input.claimText}`,
      input.steelmanText ? `Existing steelman: ${input.steelmanText}` : "",
      `Current confidence: ${input.claimConfidence}%`,
      `Critique mode: ${input.critiqueMode}`,
      input.userGoal ? `User goal: ${input.userGoal}` : "User goal: none provided.",
      input.neighboringClaims.length
        ? `Neighboring claims:\n- ${input.neighboringClaims
            .map((claim) =>
              [
                claim.text,
                claim.confidence != null ? `${claim.confidence}% confidence` : null,
                claim.relationship ? `relationship=${claim.relationship}` : null,
              ]
                .filter(Boolean)
                .join(" | "),
            )
            .join("\n- ")}`
        : "Neighboring claims: none provided.",
      input.previousRounds.length
        ? `Previous rounds:\n- ${input.previousRounds
            .map((round) =>
              [
                `Round ${round.roundNumber}`,
                round.critiqueSummary,
                round.userResponse ? `response=${round.userResponse}` : null,
                round.responsePath ? `path=${round.responsePath}` : null,
                round.confidenceDelta != null ? `delta=${round.confidenceDelta}` : null,
              ]
                .filter(Boolean)
                .join(" | "),
            )
            .join("\n- ")}`
        : "Previous rounds: none.",
      'Return JSON with "conciseCritiqueSummary", "strongestCounterargument", "assumptions", "likelyFailureModes", "followUpQuestions", "suggestedConfidenceDelta", and "uncertaintyNote".',
      "Keep the confidence delta conservative and bounded by the evidence in the prompt.",
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

async function invokeProvider(
  provider: ReplayProviderName,
  request: StructuredProviderRequest,
): Promise<StructuredProviderResponse> {
  switch (provider) {
    case "anthropic":
      return invokeAnthropicStructured(request);
    case "xai":
      return invokeXaiStructured(request);
    default:
      throw new Error(`Unsupported provider: ${provider satisfies never}`);
  }
}

async function invokeAnthropicStructured(request: StructuredProviderRequest): Promise<StructuredProviderResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not configured.");
  }

  const response = await fetch(`${resolveBaseUrl("anthropic")}/messages`, {
    method: "POST",
    headers: {
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify({
      model: request.model,
      max_tokens: request.maxTokens,
      temperature: request.temperature,
      system: request.systemPrompt,
      messages: [
        {
          role: "user",
          content: request.userPrompt,
        },
      ],
      tools: [
        {
          name: "return_result",
          description: "Return the final structured JSON result for this task.",
          input_schema: request.jsonSchema,
        },
      ],
      tool_choice: {
        type: "tool",
        name: "return_result",
      },
    }),
  });

  const payload = await parseJsonResponse(response, "Anthropic");
  if (!response.ok) {
    throw new Error(`Anthropic request failed with status ${response.status}: ${extractErrorMessage(payload)}`);
  }

  const toolUseBlock = Array.isArray(payload.content)
    ? payload.content.find((entry) => entry && typeof entry === "object" && entry.type === "tool_use")
    : null;

  if (!toolUseBlock || typeof toolUseBlock !== "object" || !("input" in toolUseBlock)) {
    throw new Error("Anthropic response did not contain a structured tool result.");
  }

  return {
    output: toolUseBlock.input,
    usage: {
      inputTokens: readNumber(payload.usage, "input_tokens"),
      outputTokens: readNumber(payload.usage, "output_tokens"),
      totalTokens: addNullableNumbers(readNumber(payload.usage, "input_tokens"), readNumber(payload.usage, "output_tokens")),
    },
    cost: {
      totalUsd: readNumber(payload.usage, "cost_usd"),
      currency: readString(payload.usage, "currency"),
    },
  };
}

async function invokeXaiStructured(request: StructuredProviderRequest): Promise<StructuredProviderResponse> {
  const apiKey = process.env.XAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("XAI_API_KEY is not configured.");
  }

  const response = await fetch(`${resolveBaseUrl("xai")}/responses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: request.model,
      input: `${request.systemPrompt}\n\n${request.userPrompt}`,
      max_output_tokens: request.maxTokens,
      temperature: request.temperature,
      text: {
        format: {
          type: "json_schema",
          name: request.schemaName,
          schema: request.jsonSchema,
          strict: true,
        },
      },
    }),
  });

  const payload = await parseJsonResponse(response, "xAI");
  if (!response.ok) {
    throw new Error(`xAI request failed with status ${response.status}: ${extractErrorMessage(payload)}`);
  }

  const outputText = extractXaiOutputText(payload);

  return {
    output: JSON.parse(outputText),
    usage: {
      inputTokens: readNumber(payload.usage, "input_tokens"),
      outputTokens: readNumber(payload.usage, "output_tokens"),
      totalTokens: readNumber(payload.usage, "total_tokens"),
    },
    cost: {
      totalUsd: readNumber(payload.usage, "cost_usd"),
      currency: readString(payload.usage, "currency"),
    },
  };
}

async function parseJsonResponse(response: Response, providerName: string) {
  const text = await response.text();

  if (!text.trim()) {
    return {};
  }

  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error();
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw new Error(`${providerName} provider returned non-JSON response (${response.status}).`);
  }
}

function extractXaiOutputText(payload: Record<string, unknown>) {
  const output = Array.isArray(payload.output) ? payload.output : [];

  for (const item of output) {
    if (!item || typeof item !== "object" || item.type !== "message") {
      continue;
    }

    const content = Array.isArray(item.content) ? item.content : [];
    for (const block of content) {
      if (block && typeof block === "object" && block.type === "output_text" && typeof block.text === "string") {
        return block.text;
      }
    }
  }

  throw new Error("xAI response did not contain structured output text.");
}

function createComparison(
  expectedOutput: GenerateChallengeCritiqueGoldenDatasetEntry["expected_output"],
  actualOutput: z.infer<typeof GenerateChallengeCritiqueOutputSchema> | null,
) {
  const fields: ReplayFileRecord["comparison"]["fields"] = {};
  const differingFields: string[] = [];

  for (const key of Object.keys(expectedOutput)) {
    const expected = expectedOutput[key as keyof typeof expectedOutput];
    const actual = actualOutput?.[key as keyof typeof expectedOutput] ?? null;
    const matches = JSON.stringify(expected) === JSON.stringify(actual);
    fields[key] = {
      expected,
      actual,
      matches,
    };

    if (!matches) {
      differingFields.push(key);
    }
  }

  return {
    exact_match: differingFields.length === 0 && actualOutput != null,
    differing_fields: differingFields,
    fields,
  };
}

function parseProviders(raw: string | null): ReplayProviderName[] {
  if (!raw) {
    return ["anthropic"];
  }

  const providers = raw.split(",").map((value) => value.trim()).filter(Boolean);
  const parsed = providers.map((provider) => {
    if (provider !== "anthropic" && provider !== "xai") {
      throw new Error(`Unsupported provider "${provider}". Supported providers: anthropic, xai.`);
    }
    return provider;
  });

  return Array.from(new Set(parsed));
}

function splitCsv(value: string | null) {
  if (!value) {
    return null;
  }

  const parts = value.split(",").map((item) => item.trim()).filter(Boolean);
  return parts.length ? Array.from(new Set(parts)) : null;
}

function parseProviderModelOverrides(raw: string | null) {
  if (!raw) {
    return {};
  }

  return raw
    .split(",")
    .map((pair) => pair.trim())
    .filter(Boolean)
    .reduce<Partial<Record<ReplayProviderName, string>>>((accumulator, pair) => {
      const [provider, model] = pair.split("=").map((part) => part?.trim());

      if (!provider || !model) {
        throw new Error(`Invalid --models value "${pair}". Expected provider=model.`);
      }

      if (provider !== "anthropic" && provider !== "xai") {
        throw new Error(`Unsupported provider "${provider}" in --models.`);
      }

      accumulator[provider] = model;
      return accumulator;
    }, {});
}

function toProviderJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  const rawSchema = z.toJSONSchema(schema) as Record<string, unknown>;
  return sanitizeJsonSchema(rawSchema) as Record<string, unknown>;
}

function sanitizeJsonSchema(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeJsonSchema(entry));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const objectValue = value as Record<string, unknown>;
  const sanitized: Record<string, unknown> = {};

  for (const [key, entry] of Object.entries(objectValue)) {
    if (key === "$schema") {
      continue;
    }

    if (key === "minLength" || key === "maxLength" || key === "minItems" || key === "maxItems") {
      continue;
    }

    sanitized[key] = sanitizeJsonSchema(entry);
  }

  return sanitized;
}

function resolveBaseUrl(provider: ReplayProviderName) {
  if (provider === "anthropic") {
    return (process.env.ANTHROPIC_BASE_URL?.trim() || "https://api.anthropic.com/v1").replace(/\/+$/, "");
  }

  return (process.env.XAI_BASE_URL?.trim() || "https://api.x.ai/v1").replace(/\/+$/, "");
}

function extractErrorMessage(payload: Record<string, unknown>) {
  if (payload.error && typeof payload.error === "object") {
    return readString(payload.error as Record<string, unknown>, "message") ?? JSON.stringify(payload.error);
  }

  return JSON.stringify(payload);
}

function readNumber(source: unknown, key: string): number | null {
  if (!source || typeof source !== "object") {
    return null;
  }

  const value = (source as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readString(source: unknown, key: string): string | null {
  if (!source || typeof source !== "object") {
    return null;
  }

  const value = (source as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function addNullableNumbers(a: number | null, b: number | null) {
  if (a == null && b == null) {
    return null;
  }

  return (a ?? 0) + (b ?? 0);
}

function createRunId() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function buildReplayFilename(entryId: string, provider: ReplayProviderName, model: string, promptVersion: string) {
  return `${slugify(entryId)}__${provider}__${slugify(model)}__${slugify(promptVersion)}.json`;
}

async function writePrettyJson(filePath: string, value: unknown) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
