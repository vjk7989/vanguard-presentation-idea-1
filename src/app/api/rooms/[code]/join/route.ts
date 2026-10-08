import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { readPost } from "@/lib/http";
import { joinRoom } from "@/lib/store";
import { apiError, COOKIE_NAME, entryToken, setSessionCookie } from "@/lib/security";

export const runtime = "nodejs";
export async function POST(req: NextRequest, context: { params: Promise<{ code: string }> }) {
  try {
    const body = await readPost(req, z.object({ requestId: z.uuid(), runId: z.uuid() }));
    const { code } = await context.params;
    const token = entryToken("join", body.requestId, code);
    const joined = await joinRoom(code, token, body.runId, req.cookies.get(COOKIE_NAME)?.value);
    const res = NextResponse.json({ code: joined.code, runId: joined.runId });
    if (!joined.reused) setSessionCookie(res, token);
    return res;
  } catch (error) { return apiError(error); }
}
