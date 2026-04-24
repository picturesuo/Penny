import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json(
    {
      ok: true,
      service: "penny-web",
    },
    { status: 200 },
  );
}
