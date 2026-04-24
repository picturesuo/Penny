import { NextResponse, type NextRequest } from "next/server";

import { getRequestId, logRequest } from "./lib/request-logging";

export function middleware(request: NextRequest) {
  const requestId = getRequestId(request.headers);
  const response = NextResponse.next();

  logRequest(request, requestId);
  response.headers.set("x-request-id", requestId);

  return response;
}

export const config = {
  matcher: ["/api/:path*", "/health"],
};
