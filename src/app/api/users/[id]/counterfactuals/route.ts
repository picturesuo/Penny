import { NextResponse } from "next/server";
import { buildCounterfactualArchiveForUser } from "@/server/counterfactual";
import { UserParamsSchema } from "@/lib/validation/schemas";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = UserParamsSchema.parse(await context.params);
  const archive = await buildCounterfactualArchiveForUser(id);

  return NextResponse.json({ archive });
}
