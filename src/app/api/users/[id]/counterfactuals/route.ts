import { NextResponse } from "next/server";
import { buildCounterfactualArchiveForUser } from "@/server/counterfactual";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const archive = await buildCounterfactualArchiveForUser(id);

  return NextResponse.json({ archive });
}
