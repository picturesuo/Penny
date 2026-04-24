import { NextResponse } from "next/server";
import { z } from "zod";
import { AUTH_SESSION_COOKIE, signInWithEmail } from "@/server/auth";
import { logger } from "@/lib/logger";
import {
  buildRateLimitResponse,
  checkRateLimit,
  getRequestRateLimitSubject,
} from "@/lib/rate-limiter";

const signInSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1).max(120),
});

export async function POST(request: Request) {
  try {
    const rateLimit = checkRateLimit(getRequestRateLimitSubject(request), "auth_signin");
    if (!rateLimit.allowed) {
      return buildRateLimitResponse(rateLimit);
    }

    const input = signInSchema.parse(await request.json());
    const result = await signInWithEmail(input);

    if (!result.ok) {
      const status =
        result.error === "email_not_found" ? 404 : result.error === "wrong_password" ? 401 : result.error === "email_not_verified" ? 403 : 400;
      return NextResponse.json({ error: result.error }, { status });
    }

    logger.info("auth_sign_in_route_completed", {
      userId: result.value.user.id,
      featureId: "auth-sign-in",
    });

    const response = NextResponse.json(
      {
        user: result.value.user,
      },
      { status: 200 },
    );
    response.cookies.set(AUTH_SESSION_COOKIE, result.value.session.token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      expires: result.value.session.expiresAt,
    });

    return response;
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "invalid_request", details: error.flatten() }, { status: 400 });
    }

    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
