import { NextRequest } from "next/server";
import { z } from "zod";
import { ids, readPost, respond } from "@/lib/http";
import { performIdeaAction } from "@/lib/store";
import { getToken } from "@/lib/security";

export const runtime = "nodejs";
export async function POST(req: NextRequest, context: { params: Promise<{ code: string }> }) {
  return respond(async () => {
    const { code } = await context.params;
    const body = await readPost(req, ids.extend({
      actionId: z.string().min(1).max(64),
      onBehalfOf: z.string().max(40).optional(),
    }));
    return performIdeaAction(code, getToken(req), body.requestId, body.runId, body.actionId,
      body.onBehalfOf as Parameters<typeof performIdeaAction>[5]);
  });
}
