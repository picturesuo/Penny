import { seedChallengeBackend, type ChallengeBackendSeedTarget } from "@/db/challenge-backend-seed";

type ParsedArgs = {
  dryRun: boolean;
  target: ChallengeBackendSeedTarget;
};

function parseArgs(argv: string[]): ParsedArgs {
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

  if (argv.includes("--help") || argv.includes("-h")) {
    printUsageAndExit(0);
  }

  const targetValue = (getOption("--target") ?? process.env.PENNY_SEED_TARGET ?? "").trim().toLowerCase();
  if (targetValue !== "local" && targetValue !== "staging") {
    throw new Error('Missing or invalid seed target. Use "--target local" or "--target staging".');
  }

  return {
    target: targetValue,
    dryRun: argv.includes("--dry-run"),
  };
}

function printUsageAndExit(code: number): never {
  console.log(
    [
      "Usage:",
      "  npx tsx src/scripts/seed-challenge-backend.ts --target local",
      "  npx tsx src/scripts/seed-challenge-backend.ts --target staging",
      "",
      "Options:",
      "  --target <local|staging>   Required non-production target",
      "  --dry-run                  Print seeded fixture summary without writing to Postgres",
      "  --help                     Show this message",
      "",
      "Environment:",
      "  POSTGRES_URL               Required unless --dry-run is used",
      "  PENNY_SEED_TARGET          Optional fallback for --target",
    ].join("\n"),
  );
  process.exit(code);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const summary = await seedChallengeBackend(args);
  console.log(`${JSON.stringify(summary, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
