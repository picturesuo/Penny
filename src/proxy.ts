import { NextResponse, type NextRequest } from "next/server";
import { AUTH_SESSION_COOKIE, getAuthenticatedUserFromToken } from "@/server/auth";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/api/auth") ||
    pathname === "/api/health" ||
    pathname === "/api/analytics" ||
    pathname.startsWith("/api/notifications/send")
  ) {
    return NextResponse.next();
  }

  const token = request.cookies.get(AUTH_SESSION_COOKIE)?.value ?? null;
  const user = await getAuthenticatedUserFromToken(token);

  if (!user) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    return new NextResponse("Unauthorized", { status: 401 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/app/:path*", "/api/:path*"],
};
