import { NextResponse } from "next/server";
import { z } from "zod";
import { createThoughtMap } from "@/server/thought-map";

const createThoughtMapSchema = z.object({
  rawThought: z
    .string()
    .min(12, "Give Penny one real thought, not a slogan.")
    .max(400, "Keep the first thought under 400 characters."),
});

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const input = createThoughtMapSchema.parse(json);
    const map = await createThoughtMap(input);
    return NextResponse.json({ map }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: "invalid_request",
          details: error.flatten(),
        },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        error: "internal_error",
      },
      { status: 500 },
    );
  }
}
