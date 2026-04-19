import { NextResponse } from "next/server";
import { z } from "zod";
import { track } from "@/lib/analytics";
import { logger } from "@/lib/logger";
import { signUpWithEmail } from "@/server/auth";
import {
  buildRateLimitResponse,
  checkRateLimit,
  getRequestRateLimitSubject,
} from "@/lib/rate-limiter";

const signUpSchema = z.object({
  displayName: z.string().trim().min(2).max(120),
  email: z.string().trim().email(),
  password: z.string().min(8).max(120),
});

export async function POST(request: Request) {
  try {
    const rateLimit = checkRateLimit(getRequestRateLimitSubject(request), "auth_signup");
    if (!rateLimit.allowed) {
      return buildRateLimitResponse(rateLimit);
    }

    const input = signUpSchema.parse(await request.json());
    const result = await signUpWithEmail(input);

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 409 });
    }

    void track(
      {
        event: "sign_up",
        properties: {
          method: "email_password",
        },
      },
      result.value.user.id,
    );
    logger.info("auth_sign_up_route_completed", {
      userId: result.value.user.id,
      featureId: "auth-sign-up",
    });

    return NextResponse.json(
      {
        user: result.value.user,
        verificationUrl: result.value.verificationUrl,
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "invalid_request", details: error.flatten() }, { status: 400 });
    }

    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
