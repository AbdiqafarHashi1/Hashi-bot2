import { NextResponse } from "next/server";
import { DASHBOARD_SESSION_COOKIE } from "../../../../lib/auth/constants";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(DASHBOARD_SESSION_COOKIE, "", { httpOnly: true, path: "/", expires: new Date(0) });
  return response;
}
