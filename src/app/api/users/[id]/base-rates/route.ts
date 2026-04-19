import { NextResponse } from "next/server";
import { getPersonalBaseRateLibrary } from "@/server/personal-base-rates";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const library = await getPersonalBaseRateLibrary(id);

  return NextResponse.json({ library });
}

