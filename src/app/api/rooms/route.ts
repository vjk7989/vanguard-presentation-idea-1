import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { readPost } from "@/lib/http";
import { createRoom } from "@/lib/store";
import { apiError, assertAccessCode, entryToken, setSessionCookie } from "@/lib/security";

export const runtime = "nodejs";
export async function POST(req: NextRequest) {
  try {
    const body = await readPost(req, z.object({ accessCode: z.string().min(1), requestId: z.uuid() }));
    assertAccessCode(body.accessCode);
    const token = entryToken("create", body.requestId);
    const created = await createRoom(token, body.requestId);
    const res = NextResponse.json(created, { status: 201 });
    setSessionCookie(res, token);
    return res;
  } catch (error) { return apiError(error); }
}
