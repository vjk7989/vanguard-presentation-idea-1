import { NextRequest } from "next/server";
import { z } from "zod";
import { ids, readPost, respond } from "@/lib/http";
import { claimRole } from "@/lib/store";
import { getToken } from "@/lib/security";

export const runtime = "nodejs";
export async function POST(req: NextRequest, context: { params: Promise<{ code: string }> }) {
  return respond(async () => {
    const { code } = await context.params;
    const body = await readPost(req, ids.extend({ role: z.enum(["issuer", "fund", "bank"]) }));
    return claimRole(code, getToken(req), body.requestId, body.runId, body.role);
  });
}
