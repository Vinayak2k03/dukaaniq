import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

// Optimistic redirect only (cookie presence, not validity). Real authorization
// happens server-side via requireSession() / requireMerchantAccess().
// Logged-in users hitting /login are redirected by the (auth) layout instead,
// so a stale cookie can never cause a redirect loop.
export function proxy(request: NextRequest) {
  if (!getSessionCookie(request)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/onboarding"],
};
