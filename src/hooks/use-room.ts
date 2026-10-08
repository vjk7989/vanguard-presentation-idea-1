"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, loadRoom, mutation } from "@/lib/client";
import type { Snapshot, WireEvent } from "@/lib/store";

export function useRoom(code: string) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [animatedEvent, setAnimatedEvent] = useState<WireEvent | null>(null);
  const seen = useRef<number | null>(null);
  const wasConnected = useRef(false);
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const data = await loadRoom(code);
      const latest = data.events.at(-1)?.index ?? 0;
      if (wasConnected.current && seen.current !== null && latest > seen.current) {
        const newest = data.events.at(-1);
        if (newest && ["request_redemption", "accept_redemption", "process_redemption", "confirm_proceeds", "approve_payouts", "confirm_payouts"].includes(newest.type)) {
          setAnimatedEvent(newest);
        }
      }
      seen.current = latest;
      wasConnected.current = true;
      setSnapshot(data);
      setConnected(true);
      setError(null);
    } catch (cause) {
      wasConnected.current = false;
      setConnected(false);
      setError(cause instanceof Error ? cause.message : "Connection unavailable.");
    } finally { inFlight.current = false; }
  }, [code]);

  useEffect(() => {
    queueMicrotask(() => { void refresh(); });
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 1000);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", onFocus); document.removeEventListener("visibilitychange", onFocus); };
  }, [refresh]);

  const post = useCallback(async <T,>(suffix: string, data: object) => {
    if (!snapshot || !connected) throw new Error("Wait for the room connection.");
    setBusy(true);
    try {
      const result = await api<T>(`/api/rooms/${encodeURIComponent(code)}/${suffix}`, mutation(snapshot.runId, data));
      inFlight.current = false;
      await refresh();
      return result;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The action failed.");
      throw cause;
    } finally { setBusy(false); }
  }, [code, connected, refresh, snapshot]);

  return { snapshot, error, connected, busy, animatedEvent, setAnimatedEvent, refresh, post };
}
