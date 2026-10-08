import { NextRequest } from "next/server";
import { z } from "zod";
import { ids, readPost, respond } from "@/lib/http";
import { getToken } from "@/lib/security";
import { advanceDemoCase } from "@/lib/store";
import { DomainError } from "@/lib/domain";

export const runtime = "nodejs";
export async function POST(req: NextRequest, context: { params: Promise<{ code: string; caseId: string }> }) {
  return respond(async () => {
    const { code, caseId } = await context.params;
    if (!z.uuid().safeParse(caseId).success) throw new DomainError("BAD_CASE", "Choose a valid practice case.", 400);
    const body = await readPost(req, ids.extend({
      action: z.enum(["fund_review", "bank_acknowledge"]),
      onBehalfOf: z.enum(["issuer", "fund", "bank"]).optional(),
    }));
    return advanceDemoCase(code, getToken(req), body.requestId, body.runId, caseId, body.action, body.onBehalfOf);
  });
}
