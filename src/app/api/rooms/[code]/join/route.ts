import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { readPost } from "@/lib/http";
import { joinRoom } from "@/lib/store";
import { apiError, entryToken, setSessionCookie } from "@/lib/security";

export const runtime = "nodejs";
export async function POST(req: NextRequest, context: { params: Promise<{ code: string }> }) {
  try {
    const body = await readPost(req, z.object({ requestId: z.uuid(), runId: z.uuid() }));
    const { code } = await context.params;
    const token = entryToken("join", body.requestId, code);
    const joined = await joinRoom(code, token, body.runId);
    const res = NextResponse.json(joined);
    setSessionCookie(res, token);
    return res;
  } catch (error) { return apiError(error); }
}
