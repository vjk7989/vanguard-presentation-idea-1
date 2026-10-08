import { NextRequest } from "next/server";
import { respond } from "@/lib/http";
import { getRunReplay } from "@/lib/store";
import { getToken } from "@/lib/security";

export const runtime = "nodejs";
export async function GET(req: NextRequest, context: { params: Promise<{ code: string; runId: string }> }) {
  return respond(async () => {
    const { code, runId } = await context.params;
    return getRunReplay(code, getToken(req), runId);
  });
}
