import { NextRequest, NextResponse } from "next/server";
import { z, ZodType } from "zod";
import { DomainError } from "./domain";
import { apiError, assertOrigin } from "./security";

export const ids = z.object({ requestId: z.uuid(), runId: z.uuid() });

export async function readPost<T>(req: NextRequest, schema: ZodType<T>): Promise<T> {
  assertOrigin(req);
  let body: unknown;
  try { body = await req.json(); } catch { throw new DomainError("BAD_JSON", "Send a valid JSON request.", 400); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new DomainError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Invalid request.", 400);
  return parsed.data;
}

export async function respond(action: () => Promise<unknown>) {
  try { return NextResponse.json(await action()); } catch (error) { return apiError(error); }
}
