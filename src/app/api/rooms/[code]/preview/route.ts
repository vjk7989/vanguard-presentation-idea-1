import { respond } from "@/lib/http";
import { roomPreview } from "@/lib/store";

export const runtime = "nodejs";
export async function GET(_req: Request, context: { params: Promise<{ code: string }> }) {
  return respond(async () => roomPreview((await context.params).code));
}
