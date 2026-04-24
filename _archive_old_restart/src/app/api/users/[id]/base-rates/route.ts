import { NextResponse } from "next/server";
import { UserParamsSchema } from "@/lib/validation/schemas";
import { getPersonalBaseRateLibrary } from "@/server/personal-base-rates";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = UserParamsSchema.parse(await context.params);
  const library = await getPersonalBaseRateLibrary(id);

  return NextResponse.json({ library });
}

