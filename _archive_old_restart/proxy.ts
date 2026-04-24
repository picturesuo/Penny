import { proxy as innerProxy } from "./src/proxy";
import type { NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  return innerProxy(request);
}

export const config = {
  matcher: ["/app/:path*", "/dashboard/:path*", "/api/:path*"],
};
