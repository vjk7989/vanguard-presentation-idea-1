import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));
import { assertOrigin } from "../../src/lib/security";

const originalOrigin = process.env.APP_ORIGIN;
afterEach(() => { process.env.APP_ORIGIN = originalOrigin; });

describe("mutation origin checks", () => {
  it("accepts the request's own origin even when APP_ORIGIN is an older deployment alias", () => {
    process.env.APP_ORIGIN = "https://older-deployment.vercel.app";
    const request = new NextRequest("https://current-deployment.vercel.app/api/rooms", {
      method: "POST", headers: { origin: "https://current-deployment.vercel.app" },
    });
    expect(() => assertOrigin(request)).not.toThrow();
  });

  it("rejects a cross-site origin", () => {
    process.env.APP_ORIGIN = "https://current-deployment.vercel.app";
    const request = new NextRequest("https://current-deployment.vercel.app/api/rooms", {
      method: "POST", headers: { origin: "https://untrusted.example" },
    });
    expect(() => assertOrigin(request)).toThrow("unapproved origin");
  });
});
