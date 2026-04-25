import crypto from "crypto";
import { DASHBOARD_SESSION_COOKIE } from "./constants";

const SESSION_TTL_SECONDS = 60 * 60 * 12;

type SessionPayload = {
  iat: number;
  exp: number;
};

function getDashboardPassword() {
  return process.env.DASHBOARD_PASSWORD?.trim() ?? "";
}

function sign(payloadB64: string, password: string) {
  return crypto.createHmac("sha256", password).update(payloadB64).digest("base64url");
}

export function dashboardAuthConfigured() {
  return getDashboardPassword().length > 0;
}

export function createDashboardSessionToken(nowSeconds = Math.floor(Date.now() / 1000)) {
  const password = getDashboardPassword();
  if (!password) throw new Error("DASHBOARD_PASSWORD is not configured");
  const payload: SessionPayload = { iat: nowSeconds, exp: nowSeconds + SESSION_TTL_SECONDS };
  const payloadB64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${payloadB64}.${sign(payloadB64, password)}`;
}

export function verifyDashboardSessionToken(token: string | undefined | null, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (!token) return false;
  const password = getDashboardPassword();
  if (!password) return false;
  const [payloadB64, signature] = token.split(".");
  if (!payloadB64 || !signature) return false;
  const expected = sign(payloadB64, password);
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return false;
  try {
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")) as SessionPayload;
    return Number.isFinite(payload.exp) && payload.exp > nowSeconds;
  } catch {
    return false;
  }
}

export function verifyDashboardPassword(input: string) {
  const expected = getDashboardPassword();
  if (!expected || !input) return false;
  const inBuf = Buffer.from(input);
  const expectedBuf = Buffer.from(expected);
  return inBuf.length === expectedBuf.length && crypto.timingSafeEqual(inBuf, expectedBuf);
}

export const dashboardSessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_TTL_SECONDS
};

export { DASHBOARD_SESSION_COOKIE };
