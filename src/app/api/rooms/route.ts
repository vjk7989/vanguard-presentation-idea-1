import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { readPost } from "@/lib/http";
import { openDemoPresenter } from "@/lib/store";
import { apiError, entryToken, setSessionCookie } from "@/lib/security";

export const runtime = "nodejs";
export async function POST(req: NextRequest) {
  try {
    const body = await readPost(req, z.object({ requestId: z.uuid() }));
    const token = entryToken("create", body.requestId);
    const created = await openDemoPresenter(token, body.requestId);
    const res = NextResponse.json(created, { status: 201 });
    setSessionCookie(res, token);
    return res;
  } catch (error) { return apiError(error); }
}
