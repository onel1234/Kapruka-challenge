import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const GUEST_SESSION_COOKIE = "kapruka_guest_session";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname !== "/chat") {
    return NextResponse.next();
  }

  const sessionToken =
    request.cookies.get("next-auth.session-token")?.value ??
    request.cookies.get("__Secure-next-auth.session-token")?.value;
  const guestToken = request.cookies.get(GUEST_SESSION_COOKIE)?.value;

  if (!sessionToken && !guestToken) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/chat"],
};
