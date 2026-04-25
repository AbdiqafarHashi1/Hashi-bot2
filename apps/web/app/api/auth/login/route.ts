import { NextResponse } from "next/server";
import {
  createDashboardSessionToken,
  DASHBOARD_SESSION_COOKIE,
  dashboardAuthConfigured,
  dashboardSessionCookieOptions,
  verifyDashboardPassword
} from "../../../../lib/auth/session";

export async function POST(req: Request) {
  if (!dashboardAuthConfigured()) {
    return NextResponse.json({ error: "dashboard_auth_not_configured" }, { status: 503 });
  }
  const body = await req.json().catch(() => ({} as { password?: string }));
  const password = typeof body.password === "string" ? body.password : "";
  if (!verifyDashboardPassword(password)) {
    return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set(DASHBOARD_SESSION_COOKIE, createDashboardSessionToken(), dashboardSessionCookieOptions);
  return response;
}
