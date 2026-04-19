import { NextResponse } from "next/server";
import { UserParamsSchema } from "@/lib/validation/schemas";
import { z } from "zod";
import { addBiographyAnnotation, getIntellectualBiography } from "@/server/intellectual-biography";

const annotationSchema = z.object({
  chapterId: z.string().min(1),
  targetType: z.enum(["chapter", "belief_shift", "highlight"]),
  targetId: z.string().min(1),
  annotationText: z.string().min(1).max(2000),
});

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = UserParamsSchema.parse(await context.params);
  const biography = await getIntellectualBiography(id);

  return NextResponse.json({ biography });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = UserParamsSchema.parse(await context.params);
    const payload = annotationSchema.parse(await request.json());

    const annotation = await addBiographyAnnotation({
      userId: id,
      chapterId: payload.chapterId,
      targetType: payload.targetType,
      targetId: payload.targetId,
      annotationText: payload.annotationText,
    });

    const biography = await getIntellectualBiography(id);

    return NextResponse.json({ annotation, biography }, { status: 201 });
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
