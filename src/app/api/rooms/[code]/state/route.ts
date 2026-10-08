import { NextRequest } from "next/server";
import { respond } from "@/lib/http";
import { getSnapshot } from "@/lib/store";
import { joinUrlForRoom } from "@/lib/demo";
import { getToken } from "@/lib/security";

export const runtime = "nodejs";
export async function GET(req: NextRequest, context: { params: Promise<{ code: string }> }) {
  return respond(async () => {
    const { code } = await context.params;
    const snapshot = await getSnapshot(code, getToken(req));
    if (snapshot.session.kind === "presenter") {
      snapshot.joinUrl = joinUrlForRoom(snapshot.code, new URL(process.env.APP_ORIGIN ?? req.url).origin);
    }
    return snapshot;
  });
}
