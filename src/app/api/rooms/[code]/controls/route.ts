import { NextRequest } from "next/server";
import { z } from "zod";
import { ids, readPost, respond } from "@/lib/http";
import { controlRoom } from "@/lib/store";
import { getToken } from "@/lib/security";

export const runtime = "nodejs";
export async function POST(req: NextRequest, context: { params: Promise<{ code: string }> }) {
  return respond(async () => {
    const { code } = await context.params;
    const body = await readPost(req, ids.extend({
      control: z.enum(["start", "pause", "resume", "reset", "end", "set_mode", "delay_bank", "release_bank", "repeat_bank", "switch_idea"]),
      mode: z.enum(["conventional", "ledger"]).optional(),
      ideaKey: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).optional(),
    }));
    return controlRoom(code, getToken(req), body.requestId, body.runId, body.control, body.mode, body.ideaKey);
  });
}
