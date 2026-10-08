import { NextRequest } from "next/server";
import { z } from "zod";
import { ids, readPost, respond } from "@/lib/http";
import { performAction } from "@/lib/store";
import { getToken } from "@/lib/security";

export const runtime = "nodejs";
export async function POST(req: NextRequest, context: { params: Promise<{ code: string }> }) {
  return respond(async () => {
    const { code } = await context.params;
    const body = await readPost(req, ids.extend({
      action: z.enum(["request_redemption", "accept_redemption", "process_redemption", "confirm_proceeds", "approve_payouts", "confirm_payouts"]),
      onBehalfOf: z.enum(["issuer", "fund", "bank"]).optional(),
    }));
    return performAction(code, getToken(req), body.requestId, body.runId, body.action, body.onBehalfOf);
  });
}
