import { NextRequest } from "next/server";
import { ids, readPost, respond } from "@/lib/http";
import { completeMockItem } from "@/lib/store";
import { getToken } from "@/lib/security";

export const runtime = "nodejs";
export async function POST(req: NextRequest, context: { params: Promise<{ code: string; itemKey: string }> }) {
  return respond(async () => {
    const { code, itemKey } = await context.params;
    const body = await readPost(req, ids);
    return completeMockItem(code, getToken(req), body.requestId, body.runId, itemKey);
  });
}
