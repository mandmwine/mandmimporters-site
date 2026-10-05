import { NextResponse, type NextRequest } from "next/server";

// Fast gate: anyone without a session cookie is sent to the login page.
// Every page and server action still verifies the session itself (lib/auth.ts).
const PUBLIC_PATHS = ["/login", "/api/session", "/api/health"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) return NextResponse.next();
  if (!request.cookies.get("__session")?.value) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt).*)"],
};
