import innerProxy from "./src/proxy";

export function proxy() {
  return innerProxy();
}

export const config = {
  matcher: ["/app/:path*", "/api/:path*"],
};
