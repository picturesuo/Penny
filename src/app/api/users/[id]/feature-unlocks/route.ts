import { NextResponse } from "next/server";
import { getFeatureUnlockStatuses } from "@/server/time-locked-features";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const result = await getFeatureUnlockStatuses(id);

  return NextResponse.json(result);
}
