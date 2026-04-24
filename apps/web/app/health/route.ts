import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json(
    {
      ok: true,
      service: "penny",
      timestamp: new Date().toISOString(),
    },
    { status: 200 },
  );
}
