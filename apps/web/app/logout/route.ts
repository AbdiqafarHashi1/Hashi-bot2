import { NextResponse } from "next/server";
import { DASHBOARD_SESSION_COOKIE } from "../../lib/auth/constants";

export async function GET(request: Request) {
  const response = NextResponse.redirect(new URL("/login", request.url));
  response.cookies.set(DASHBOARD_SESSION_COOKIE, "", { httpOnly: true, path: "/", expires: new Date(0) });
  return response;
}
