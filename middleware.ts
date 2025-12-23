import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // allow public routes
  if (pathname.startsWith("/login")) return NextResponse.next();
  if (pathname.startsWith("/api/auth/login")) return NextResponse.next();
  if (pathname.startsWith("/api/auth/logout")) return NextResponse.next();

  // allow static
  if (pathname.startsWith("/_next") || pathname === "/favicon.ico") {
    return NextResponse.next();
  }

  // allow API (opsional)
  if (pathname.startsWith("/api")) return NextResponse.next();

  const session = req.cookies.get("asakai_session")?.value;
  const role = req.cookies.get("asakai_role")?.value; // "admin" | "user"

  // belum login → ke /login
  if (!session) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }

  // ✅ ROLE USER: hanya boleh /input
  if (role === "user") {
    const allowed = pathname === "/input" || pathname.startsWith("/input/");
    if (!allowed) {
      const url = req.nextUrl.clone();
      url.pathname = "/input";
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
