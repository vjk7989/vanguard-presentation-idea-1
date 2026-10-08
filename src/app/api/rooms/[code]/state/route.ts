import { NextRequest } from "next/server";
import { respond } from "@/lib/http";
import { getSnapshot } from "@/lib/store";
import { getToken } from "@/lib/security";

export const runtime = "nodejs";
export async function GET(req: NextRequest, context: { params: Promise<{ code: string }> }) {
  return respond(async () => {
    const { code } = await context.params;
    return getSnapshot(code, getToken(req));
  });
}
