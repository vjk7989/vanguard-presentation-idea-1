"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, loadRoom, mutation, type ApiError } from "@/lib/client";
import type { Snapshot, WireEvent } from "@/lib/store";

const animatedTypes = new Set([
  "request_redemption", "accept_redemption", "process_redemption", "confirm_proceeds",
  "approve_payouts", "confirm_payouts", "case_opened", "case_fund_reviewed", "case_bank_acknowledged",
]);

export function useRoom(code: string) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [animatedEvent, setAnimatedEvent] = useState<WireEvent | null>(null);
  const snapshotRef = useRef<Snapshot | null>(null);
  const seen = useRef<number | null>(null);
  const wasConnected = useRef(false);
  const suppressNext = useRef(false);
  const inFlight = useRef(false);
  const animationQueue = useRef<WireEvent[]>([]);
  const animationTimer = useRef<number | null>(null);

  const playNext = useCallback(function playNext() {
    if (animationTimer.current !== null || !animationQueue.current.length) return;
    setAnimatedEvent(animationQueue.current.shift() ?? null);
    animationTimer.current = window.setTimeout(() => {
      animationTimer.current = null;
      setAnimatedEvent(null);
      playNext();
    }, 950);
  }, []);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const previous = snapshotRef.current;
      const cursor = previous && seen.current !== null
        ? { revision: previous.revision, eventIndex: seen.current, runId: previous.runId } : undefined;
      const data = cursor ? await loadRoom(code, cursor) : await loadRoom(code);
      if ("changed" in data) {
        if (previous && previous.runId === data.runId) {
          const merged = { ...previous, revision: data.revision, roles: data.roles,
            presence: data.presence, serverTime: data.serverTime };
          snapshotRef.current = merged;
          setSnapshot(merged);
        }
      } else {
        const sameRun = previous?.runId === data.runId;
        const latest = data.latestEventIndex ?? data.events.at(-1)?.index ?? 0;
        if (sameRun && wasConnected.current && !suppressNext.current && seen.current !== null &&
          document.visibilityState === "visible") {
          animationQueue.current.push(...data.events.filter(event =>
            event.index > seen.current! && animatedTypes.has(event.type)));
          playNext();
        }
        if (!sameRun) {
          animationQueue.current = [];
          if (animationTimer.current !== null) window.clearTimeout(animationTimer.current);
          animationTimer.current = null;
          setAnimatedEvent(null);
        }
        const merged = { ...data, events: sameRun && previous
          ? [...previous.events, ...data.events.filter(event => event.index > (previous.events.at(-1)?.index ?? 0))]
          : data.events };
        snapshotRef.current = merged;
        setSnapshot(merged);
        seen.current = latest;
      }
      wasConnected.current = true;
      suppressNext.current = false;
      setConnected(true);
      setError(null);
      setErrorCode(null);
    } catch (cause) {
      wasConnected.current = false;
      setConnected(false);
      setError(cause instanceof Error ? cause.message : "Connection unavailable.");
      setErrorCode((cause as ApiError)?.code ?? null);
    } finally { inFlight.current = false; }
  }, [code, playNext]);

  useEffect(() => {
    queueMicrotask(() => { void refresh(); });
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 2000);
    const onFocus = () => { if (document.visibilityState === "visible") void refresh(); };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") suppressNext.current = true;
      else void refresh();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      if (animationTimer.current !== null) window.clearTimeout(animationTimer.current);
    };
  }, [refresh]);

  const post = useCallback(async <T,>(suffix: string, data: object) => {
    const current = snapshotRef.current;
    if (!current || !connected) throw new Error("Wait for the room connection.");
    setBusy(true);
    try {
      const result = await api<T>(`/api/rooms/${encodeURIComponent(code)}/${suffix}`, mutation(current.runId, data));
      inFlight.current = false;
      await refresh();
      return result;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The action failed.");
      setErrorCode((cause as ApiError)?.code ?? null);
      throw cause;
    } finally { setBusy(false); }
  }, [code, connected, refresh]);

  return { snapshot, error, errorCode, connected, busy, animatedEvent, setAnimatedEvent, refresh, post };
}
