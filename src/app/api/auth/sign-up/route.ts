import { NextResponse } from "next/server";
import { z } from "zod";
import { signUpWithEmail } from "@/server/auth";

const signUpSchema = z.object({
  displayName: z.string().trim().min(2).max(120),
  email: z.string().trim().email(),
  password: z.string().min(8).max(120),
});

export async function POST(request: Request) {
  try {
    const input = signUpSchema.parse(await request.json());
    const result = await signUpWithEmail(input);

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 409 });
    }

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
