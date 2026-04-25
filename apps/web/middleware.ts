import { NextResponse, type NextRequest } from "next/server";
import { DASHBOARD_SESSION_COOKIE } from "./lib/auth/constants";
import { verifyDashboardSessionTokenEdge } from "./lib/auth/session-edge";

const protectedPagePrefixes = ["/dashboard", "/runtime", "/settings"];
const protectedApiPrefixes = ["/api/control", "/api/signal-room", "/api/system-control", "/api/settings", "/api/control-room"];

function isProtectedPage(pathname: string) {
  return protectedPagePrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function isProtectedApi(pathname: string) {
  return protectedApiPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const protectedPage = isProtectedPage(pathname);
  const protectedApi = isProtectedApi(pathname);
  if (!protectedPage && !protectedApi) return NextResponse.next();

  const dashboardPassword = process.env.DASHBOARD_PASSWORD?.trim() ?? "";
  if (!dashboardPassword) {
    if (protectedApi) {
      return NextResponse.json({ error: "dashboard_auth_not_configured" }, { status: 503 });
    }
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("error", "dashboard_auth_not_configured");
    return NextResponse.redirect(loginUrl);
  }

  const token = req.cookies.get(DASHBOARD_SESSION_COOKIE)?.value;
  const authenticated = await verifyDashboardSessionTokenEdge(token, dashboardPassword);
  if (authenticated) return NextResponse.next();

  if (protectedApi) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const loginUrl = new URL("/login", req.url);
  loginUrl.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/dashboard/:path*", "/runtime/:path*", "/settings/:path*", "/api/control/:path*", "/api/signal-room/:path*", "/api/system-control/:path*", "/api/settings/:path*", "/api/control-room/:path*"]
};
