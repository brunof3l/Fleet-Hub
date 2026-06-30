import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "fh_session";

// Coarse gate for page navigation UX only. Real validation happens server-side
// (requirePageUser / requireApiUser), since the Edge middleware cannot reach the
// database to validate the session token.
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = request.cookies.has(SESSION_COOKIE);

  // API routes enforce auth inside their own handlers.
  if (pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  if (pathname === "/login") {
    if (hasSession) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  if (!hasSession) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  // Run on every route except Next internals and static assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|txt|xml)$).*)"],
};
