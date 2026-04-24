import "server-only";

import { createHash, pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "@/db/prisma";
import { DEMO_USER_ID } from "@/lib/penny";
import { logger } from "@/lib/logger";

export const AUTH_SESSION_COOKIE = "penny_session";
export const AUTH_VERIFICATION_COOKIE = "penny_verification";
const PASSWORD_ITERATIONS = 120_000;
const SESSION_TTL_DAYS = 30;
const VERIFICATION_TTL_HOURS = 24;

export type AuthAccount = {
  id: string;
  email: string;
  displayName: string;
  emailVerifiedAt: Date | null;
};

export type AuthStatus = "email_not_verified" | "email_already_in_use" | "email_not_found" | "wrong_password";

export type AuthResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: AuthStatus };

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function normalizeDisplayName(displayName: string) {
  return displayName.trim().replace(/\s+/g, " ");
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function createPasswordHash(password: string, salt = randomBytes(16).toString("hex")) {
  const derived = pbkdf2Sync(password, salt, PASSWORD_ITERATIONS, 64, "sha512").toString("hex");

  return `pbkdf2_sha512$${PASSWORD_ITERATIONS}$${salt}$${derived}`;
}

function verifyPassword(password: string, storedHash: string, storedSalt: string) {
  const expected = createPasswordHash(password, storedSalt);
  const expectedBytes = Buffer.from(expected, "utf8");
  const actualBytes = Buffer.from(storedHash, "utf8");

  if (expectedBytes.length !== actualBytes.length) {
    return false;
  }

  return timingSafeEqual(expectedBytes, actualBytes);
}

export function createVerificationUrl(token: string) {
  return `/auth/verify?token=${encodeURIComponent(token)}`;
}

async function createVerificationToken(userId: string) {
  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + VERIFICATION_TTL_HOURS * 60 * 60 * 1000);

  await prisma.emailVerificationToken.create({
    data: {
      userId,
      tokenHash,
      expiresAt,
    },
  });

  return {
    token: rawToken,
    expiresAt,
  };
}

export async function signUpWithEmail(params: {
  email: string;
  password: string;
  displayName: string;
}) {
  const email = normalizeEmail(params.email);
  const displayName = normalizeDisplayName(params.displayName);
  logger.info("auth_sign_up_started", {
    featureId: "auth-sign-up",
    data: { emailDomain: email.split("@")[1] ?? null },
  });
  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    logger.warn("auth_sign_up_duplicate_email", {
      featureId: "auth-sign-up",
      data: { emailDomain: email.split("@")[1] ?? null },
    });
    return { ok: false as const, error: "email_already_in_use" as const };
  }

  const passwordSalt = randomBytes(16).toString("hex");
  const passwordHash = createPasswordHash(params.password, passwordSalt);
  const user = await prisma.user.create({
    data: {
      email,
      displayName,
      passwordHash,
      passwordSalt,
    },
  });

  const verification = await createVerificationToken(user.id);
  logger.info("auth_sign_up_completed", {
    userId: user.id,
    featureId: "auth-sign-up",
    data: { emailDomain: email.split("@")[1] ?? null },
  });

  return {
    ok: true as const,
    value: {
      user: toAuthAccount(user),
      verificationToken: verification.token,
      verificationUrl: createVerificationUrl(verification.token),
    },
  };
}

export async function verifyEmailToken(token: string) {
  const tokenHash = hashToken(token);
  logger.info("auth_email_verification_checked", {
    featureId: "auth-sign-up",
  });
  const record = await prisma.emailVerificationToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!record || record.consumedAt || record.expiresAt.getTime() < Date.now()) {
    return { ok: false as const, error: "email_not_found" as const };
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      data: { emailVerifiedAt: new Date() },
    }),
    prisma.emailVerificationToken.update({
      where: { tokenHash },
      data: { consumedAt: new Date() },
    }),
  ]);
  logger.info("auth_email_verified", {
    userId: record.userId,
    featureId: "auth-sign-up",
  });

  return {
    ok: true as const,
    value: toAuthAccount(record.user),
  };
}

export async function signInWithEmail(params: { email: string; password: string }) {
  const email = normalizeEmail(params.email);
  logger.info("auth_sign_in_started", {
    featureId: "auth-sign-in",
    data: { emailDomain: email.split("@")[1] ?? null },
  });
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    logger.warn("auth_sign_in_email_not_found", {
      featureId: "auth-sign-in",
      data: { emailDomain: email.split("@")[1] ?? null },
    });
    return { ok: false as const, error: "email_not_found" as const };
  }

  if (!user.emailVerifiedAt) {
    logger.warn("auth_sign_in_unverified_email", {
      userId: user.id,
      featureId: "auth-sign-in",
    });
    return { ok: false as const, error: "email_not_verified" as const };
  }

  const verified = verifyPassword(params.password, user.passwordHash, user.passwordSalt);
  if (!verified) {
    logger.warn("auth_sign_in_wrong_password", {
      userId: user.id,
      featureId: "auth-sign-in",
    });
    return { ok: false as const, error: "wrong_password" as const };
  }

  const session = await createAuthSession(user.id);
  logger.info("auth_sign_in_completed", {
    userId: user.id,
    featureId: "auth-sign-in",
  });
  return {
    ok: true as const,
    value: {
      user: toAuthAccount(user),
      session,
    },
  };
}

export async function createAuthSession(userId: string) {
  const sessionToken = randomBytes(32).toString("hex");
  const sessionTokenHash = hashToken(sessionToken);
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);

  await prisma.authSession.create({
    data: {
      userId,
      sessionTokenHash,
      expiresAt,
    },
  });
  logger.info("auth_session_created", {
    userId,
    featureId: "auth-session",
  });

  return {
    token: sessionToken,
    expiresAt,
  };
}

export async function revokeAuthSession(token: string) {
  const sessionTokenHash = hashToken(token);
  await prisma.authSession.updateMany({
    where: { sessionTokenHash },
    data: { revokedAt: new Date() },
  });
  logger.info("auth_session_revoked", {
    featureId: "auth-session",
  });
}

export async function getAuthenticatedUserFromToken(token?: string | null) {
  if (!token) {
    return null;
  }

  const sessionTokenHash = hashToken(token);
  const record = await prisma.authSession.findUnique({
    where: { sessionTokenHash },
    include: { user: true },
  });

  if (!record || record.revokedAt || record.expiresAt.getTime() < Date.now()) {
    return null;
  }

  return toAuthAccount(record.user);
}

export async function getAuthenticatedUserFromCookies() {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_SESSION_COOKIE)?.value;
  const user = await getAuthenticatedUserFromToken(token);
  if (user) {
    return user;
  }

  return {
    id: DEMO_USER_ID,
    email: "demo@penny.local",
    displayName: "Demo Founder",
    emailVerifiedAt: new Date(),
  };
}

export async function getCurrentAuthenticatedUserId() {
  const user = await getAuthenticatedUserFromCookies();
  return user?.id ?? DEMO_USER_ID;
}

export async function consumeAuthSessionCookie() {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_SESSION_COOKIE)?.value;
  if (!token) {
    return;
  }

  await revokeAuthSession(token);
  cookieStore.set(AUTH_SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

export async function setAuthSessionCookie(token: string, expiresAt: Date) {
  const cookieStore = await cookies();
  cookieStore.set(AUTH_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

function toAuthAccount(user: {
  id: string;
  email: string;
  displayName: string;
  emailVerifiedAt: Date | null;
}): AuthAccount {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    emailVerifiedAt: user.emailVerifiedAt,
  };
}
