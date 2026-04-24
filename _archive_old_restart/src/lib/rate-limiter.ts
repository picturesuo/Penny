import "server-only";

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

const store = new Map<string, RateLimitEntry>();

export type RateLimitConfig = {
  maxRequests: number;
  windowMs: number;
};

export const LIMITS = {
  // AI routes - expensive
  ai_critique: { maxRequests: 20, windowMs: 60 * 60 * 1000 }, // 20/hour
  ai_steel_man: { maxRequests: 30, windowMs: 60 * 60 * 1000 }, // 30/hour
  ai_classify: { maxRequests: 50, windowMs: 60 * 60 * 1000 }, // 50/hour
  ai_extraction: { maxRequests: 10, windowMs: 60 * 60 * 1000 }, // 10/hour
  // General API routes
  api_general: { maxRequests: 200, windowMs: 60 * 1000 }, // 200/minute
  // Auth routes
  auth_signin: { maxRequests: 10, windowMs: 15 * 60 * 1000 }, // 10/15min
  auth_signup: { maxRequests: 5, windowMs: 60 * 60 * 1000 }, // 5/hour
} as const satisfies Record<string, RateLimitConfig>;

export type RateLimitKey = keyof typeof LIMITS;

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
};

export class RateLimitError extends Error {
  readonly limitKey: RateLimitKey;
  readonly resetAt: number;
  readonly retryAfterSeconds: number;

  constructor(limitKey: RateLimitKey, resetAt: number) {
    super(`Rate limit exceeded for ${limitKey}`);
    this.name = "RateLimitError";
    this.limitKey = limitKey;
    this.resetAt = resetAt;
    this.retryAfterSeconds = getRetryAfterSeconds(resetAt);
  }
}

function normalizeSubject(subject: string) {
  const trimmed = subject.trim();
  return trimmed.length > 0 ? trimmed : "unknown";
}

function buildStoreKey(subject: string, limitKey: RateLimitKey) {
  return `${normalizeSubject(subject)}:${limitKey}`;
}

function pruneExpiredEntries(now: number) {
  for (const [key, entry] of store.entries()) {
    if (entry.resetAt <= now) {
      store.delete(key);
    }
  }
}

export function getRetryAfterSeconds(resetAt: number) {
  return Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
}

export function checkRateLimit(subject: string, limitKey: RateLimitKey): RateLimitResult {
  const config = LIMITS[limitKey];
  const now = Date.now();
  pruneExpiredEntries(now);

  const key = buildStoreKey(subject, limitKey);
  const entry = store.get(key);

  if (!entry || entry.resetAt <= now) {
    const resetAt = now + config.windowMs;
    store.set(key, { count: 1, resetAt });
    return {
      allowed: true,
      remaining: config.maxRequests - 1,
      resetAt,
    };
  }

  if (entry.count >= config.maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: entry.resetAt,
    };
  }

  entry.count += 1;
  return {
    allowed: true,
    remaining: config.maxRequests - entry.count,
    resetAt: entry.resetAt,
  };
}

export function assertRateLimit(subject: string, limitKey: RateLimitKey): RateLimitResult {
  const result = checkRateLimit(subject, limitKey);
  if (!result.allowed) {
    throw new RateLimitError(limitKey, result.resetAt);
  }

  return result;
}

export function isRateLimitError(error: unknown): error is RateLimitError {
  return error instanceof RateLimitError;
}

export function getRequestRateLimitSubject(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = request.headers.get("x-real-ip")?.trim();
  const connectingIp = request.headers.get("cf-connecting-ip")?.trim();

  return forwardedFor || realIp || connectingIp || "unknown";
}

export function buildRateLimitResponse(result: Pick<RateLimitResult, "resetAt">) {
  const retryAfterSeconds = getRetryAfterSeconds(result.resetAt);

  return new Response(
    JSON.stringify({
      error: "rate_limited",
      retryAfterSeconds,
      resetAt: new Date(result.resetAt).toISOString(),
    }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(retryAfterSeconds),
      },
    },
  );
}
