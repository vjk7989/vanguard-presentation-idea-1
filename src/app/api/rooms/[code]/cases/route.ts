import { NextRequest } from "next/server";
import { z } from "zod";
import { ids, readPost, respond } from "@/lib/http";
import { getToken } from "@/lib/security";
import { createDemoCase } from "@/lib/store";

export const runtime = "nodejs";
export async function POST(req: NextRequest, context: { params: Promise<{ code: string }> }) {
  return respond(async () => {
    const { code } = await context.params;
    const body = await readPost(req, ids.extend({
      preset: z.enum(["5m", "10m", "25m"]),
      onBehalfOf: z.enum(["issuer", "fund", "bank"]).optional(),
    }));
    return createDemoCase(code, getToken(req), body.requestId, body.runId, body.preset, body.onBehalfOf);
  });
}
