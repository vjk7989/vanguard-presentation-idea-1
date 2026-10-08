import { NextRequest } from "next/server";
import { ids, readPost, respond } from "@/lib/http";
import { leaveRole } from "@/lib/store";
import { getToken } from "@/lib/security";

export const runtime = "nodejs";
export async function POST(req: NextRequest, context: { params: Promise<{ code: string }> }) {
  return respond(async () => {
    const { code } = await context.params;
    const body = await readPost(req, ids);
    return leaveRole(code, getToken(req), body.requestId, body.runId);
  });
}
