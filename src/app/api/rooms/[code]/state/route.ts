import { NextRequest } from "next/server";
import { respond } from "@/lib/http";
import { getRoomPoll, getSnapshot } from "@/lib/store";
import { joinUrlForRoom } from "@/lib/demo";
import { getToken } from "@/lib/security";
import { DomainError } from "@/lib/domain";
import { z } from "zod";

export const runtime = "nodejs";
export async function GET(req: NextRequest, context: { params: Promise<{ code: string }> }) {
  return respond(async () => {
    const { code } = await context.params;
    const afterRevision = req.nextUrl.searchParams.get("afterRevision");
    const afterEventIndex = req.nextUrl.searchParams.get("afterEventIndex");
    const knownRunId = req.nextUrl.searchParams.get("knownRunId");
    const polling = afterRevision !== null || afterEventIndex !== null || knownRunId !== null;
    if (polling && (afterRevision === null || afterEventIndex === null || !knownRunId ||
      !/^\d+$/.test(afterRevision) || !/^\d+$/.test(afterEventIndex) ||
      !Number.isSafeInteger(Number(afterRevision)) || !Number.isSafeInteger(Number(afterEventIndex)) ||
      !z.uuid().safeParse(knownRunId).success)) {
      throw new DomainError("BAD_CURSOR", "Refresh the room to reset its event cursor.", 400);
    }
    const snapshot = polling
      ? await getRoomPoll(code, getToken(req), Number(afterRevision), Number(afterEventIndex), knownRunId!)
      : await getSnapshot(code, getToken(req));
    if (!("changed" in snapshot) && snapshot.session.kind === "presenter") {
      snapshot.joinUrl = joinUrlForRoom(snapshot.code, new URL(process.env.APP_ORIGIN ?? req.url).origin);
    }
    return snapshot;
  });
}
