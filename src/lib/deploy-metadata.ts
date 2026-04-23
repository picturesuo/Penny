export type DeployMetadata = {
  release: string;
  environment: string;
};

let cachedDeployMetadata: DeployMetadata | null = null;

export function getReleaseIdentifier(): string {
  return getDeployMetadata().release;
}

export function getEnvironmentName(): string {
  return getDeployMetadata().environment;
}

export function getDeployMetadata(): DeployMetadata {
  if (cachedDeployMetadata) {
    return cachedDeployMetadata;
  }

  cachedDeployMetadata = {
    release: resolveReleaseIdentifier(),
    environment: resolveEnvironmentName(),
  };

  return cachedDeployMetadata;
}

function resolveReleaseIdentifier(): string {
  const explicitRelease =
    readEnv("PENNY_RELEASE") ??
    readEnv("RELEASE_VERSION") ??
    readEnv("SENTRY_RELEASE") ??
    readEnv("VERCEL_GIT_COMMIT_SHA") ??
    readEnv("GITHUB_SHA") ??
    readEnv("COMMIT_SHA") ??
    readEnv("VERCEL_DEPLOYMENT_ID") ??
    readEnv("RAILWAY_DEPLOYMENT_ID") ??
    readEnv("RENDER_GIT_COMMIT");

  if (explicitRelease) {
    return explicitRelease.length > 20 ? explicitRelease.slice(0, 20) : explicitRelease;
  }

  const packageVersion = readEnv("APP_VERSION") ?? readEnv("npm_package_version");
  if (packageVersion) {
    return `app@${packageVersion}`;
  }

  return "dev";
}

function resolveEnvironmentName(): string {
  return (
    readEnv("PENNY_ENVIRONMENT") ??
    readEnv("APP_ENV") ??
    readEnv("SENTRY_ENVIRONMENT") ??
    readEnv("VERCEL_ENV") ??
    readEnv("NODE_ENV") ??
    "unknown"
  );
}

function readEnv(key: string): string | null {
  const value = process.env[key]?.trim();
  return value && value.length > 0 ? value : null;
}

