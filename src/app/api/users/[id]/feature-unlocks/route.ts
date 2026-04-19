import { NextResponse } from "next/server";
import { getFeatureUnlockStatuses } from "@/server/time-locked-features";
import { UserParamsSchema } from "@/lib/validation/schemas";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = UserParamsSchema.parse(await context.params);
  const result = await getFeatureUnlockStatuses(id);

  return NextResponse.json(result);
}
