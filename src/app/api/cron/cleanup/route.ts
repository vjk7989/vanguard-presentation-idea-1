import { NextRequest, NextResponse } from "next/server";
import { cleanupExpired } from "@/lib/store";
import { apiError } from "@/lib/security";

export const runtime = "nodejs";
export async function GET(req: NextRequest) {
  try {
    const secret = process.env.CRON_SECRET;
    if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    return NextResponse.json({ removed: await cleanupExpired() });
  } catch (error) { return apiError(error); }
}
