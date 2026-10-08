import type { Snapshot } from "./store";

export type ApiError = Error & { code?: string };

export async function api<T>(path: string, body?: object): Promise<T> {
  const res = await fetch(path, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), cache: "no-store" } : { cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.message || "The request failed.") as ApiError;
    error.code = data.error;
    throw error;
  }
  return data as T;
}

export function mutation(runId: string, extra: object = {}) {
  return { requestId: crypto.randomUUID(), runId, ...extra };
}

export async function loadRoom(code: string): Promise<Snapshot> {
  return api<Snapshot>(`/api/rooms/${encodeURIComponent(code)}/state`);
}
