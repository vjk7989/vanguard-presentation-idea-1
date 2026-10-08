import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { DomainError } from "./domain";

export const COOKIE_NAME = "reserve_lab_session";

function secret() {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) throw new Error("SESSION_SECRET must contain at least 32 characters.");
  return value;
}

export function entryToken(scope: "create" | "join", requestId: string, code = "") {
  return createHmac("sha256", secret()).update(`${scope}:${requestId}:${code.toUpperCase()}`).digest("base64url");
}
export function tokenHash(token: string) { return createHmac("sha256", secret()).update(token).digest("hex"); }

export function assertAccessCode(submitted: string) {
  const configured = process.env.PRESENTER_ACCESS_CODE;
  if (!configured) throw new Error("PRESENTER_ACCESS_CODE is required.");
  const a = createHmac("sha256", secret()).update(submitted).digest();
  const b = createHmac("sha256", secret()).update(configured).digest();
  if (!timingSafeEqual(a, b)) throw new DomainError("ACCESS_DENIED", "The presenter code is incorrect.", 403);
}

export function assertOrigin(req: NextRequest) {
  const expected = process.env.APP_ORIGIN;
  if (!expected) throw new Error("APP_ORIGIN is required.");
  if (req.headers.get("origin") !== new URL(expected).origin) throw new DomainError("BAD_ORIGIN", "This request came from an unapproved origin.", 403);
}

export function getToken(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) throw new DomainError("NO_SESSION", "Join this room to continue.", 401);
  return token;
}

export function setSessionCookie(res: NextResponse, token: string) {
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24,
  });
}

export function apiError(error: unknown) {
  if (error instanceof DomainError) return NextResponse.json({ error: error.code, message: error.message }, { status: error.status });
  if (error && typeof error === "object" && "code" in error && error.code === "23505") {
    return NextResponse.json({ error: "ROLE_TAKEN", message: "This role was just taken. Choose another role." }, { status: 409 });
  }
  console.error(error);
  return NextResponse.json({ error: "SERVER_ERROR", message: "The server could not complete this request." }, { status: 500 });
}
