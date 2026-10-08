import { NextRequest } from "next/server";
import { z } from "zod";
import { ids, readPost, respond } from "@/lib/http";
import { performPracticeAction } from "@/lib/store";
import { getToken } from "@/lib/security";

export const runtime = "nodejs";
export async function POST(req: NextRequest, context: { params: Promise<{ code: string }> }) {
  return respond(async () => {
    const { code } = await context.params;
    const body = await readPost(req, ids.extend({
      itemKey: z.string().min(1).max(80),
      action: z.enum(["acknowledge", "request_clarification", "respond", "flag", "resolve"]),
      onBehalfOf: z.string().max(40).optional(),
    }));
    return performPracticeAction(code, getToken(req), body.requestId, body.runId, body.itemKey, body.action,
      body.onBehalfOf as Parameters<typeof performPracticeAction>[6]);
  });
}
