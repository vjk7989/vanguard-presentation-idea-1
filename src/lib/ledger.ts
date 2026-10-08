import { createHash } from "node:crypto";

export type HashInput = { runId: string; index: number; type: string; actor: string; onBehalfOf: string | null; label: string; amount: string | null; reference: string | null; previousHash: string; stateAfter: unknown; createdAt: string };

export function hashEvent(input: HashInput) {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}
