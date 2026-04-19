import { NextResponse, type NextRequest } from "next/server";
import { AUTH_SESSION_COOKIE, revokeAuthSession } from "@/server/auth";

export async function POST(request: NextRequest) {
  const sessionToken = request.cookies.get(AUTH_SESSION_COOKIE)?.value ?? null;
  if (sessionToken) {
    await revokeAuthSession(sessionToken);
  }

  const response = NextResponse.json({ signedOut: true }, { status: 200 });
  response.cookies.set(AUTH_SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return response;
}
