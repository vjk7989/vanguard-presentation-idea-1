"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CircleCheck, CircleDashed, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Disclaimer, ThemeToggle } from "@/components/common";
import { api, loadRoom, mutation, type ApiError } from "@/lib/client";
import type { Role } from "@/lib/domain";

type Preview = { code: string; runId: string; status: string; roles: { role: Role; claimed: boolean }[] };
const names: Record<Role, string> = { issuer: "Issuer treasury", fund: "Fund operations", bank: "Bank operations" };
const descriptions: Record<Role, string> = {
  issuer: "Manage liquidity and payout authorizations.",
  fund: "Review redemption batches and settlement.",
  bank: "Confirm incoming wires and payment files.",
};

export function JoinRoom({ code }: { code: string }) {
  const router = useRouter();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [joined, setJoined] = useState(false);
  const [kicked, setKicked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const joinedRef = useRef(false);
  const inFlight = useRef(false);

  const register = useCallback(async (current: Preview) => {
    setBusy(true); setError("");
    try {
      await api(`/api/rooms/${code}/join`, mutation(current.runId));
      joinedRef.current = true;
      setJoined(true);
      setKicked(false);
      const room = await loadRoom(code);
      setPreview({ code: room.code, runId: room.runId, status: room.status, roles: room.roles });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not join the room."); }
    finally { setBusy(false); }
  }, [code]);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const room = await loadRoom(code);
      if (room.session.kind === "presenter") { router.replace(`/presenter/${code}`); return; }
      if (room.session.role) { router.replace(`/room/${code}`); return; }
      joinedRef.current = true;
      setJoined(true); setKicked(false); setError("");
      setPreview({ code: room.code, runId: room.runId, status: room.status, roles: room.roles });
    } catch (cause) {
      if ((cause as ApiError).code === "NO_SESSION" && joinedRef.current) {
        setKicked(true); setJoined(false); setError("");
        return;
      }
      try {
        const current = await api<Preview>(`/api/rooms/${code}/preview`);
        setPreview(current);
        if (!joinedRef.current) await register(current);
      } catch (previewError) {
        setError(previewError instanceof Error ? previewError.message : "Room unavailable.");
      }
    } finally { inFlight.current = false; }
  }, [code, register, router]);

  useEffect(() => {
    queueMicrotask(() => { void refresh(); });
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 2000);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", onFocus); };
  }, [refresh]);

  async function claim(role: Role) {
    if (!preview) return;
    setBusy(true); setError("");
    try {
      await api(`/api/rooms/${code}/roles/claim`, mutation(preview.runId, { role }));
      router.replace(`/room/${code}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Role unavailable.");
      await refresh();
    } finally { setBusy(false); }
  }

  async function rejoin() {
    if (!preview) return;
    joinedRef.current = false;
    await register(preview);
  }

  return <div className="flex min-h-screen flex-col bg-background text-foreground"><header className="mx-auto flex w-full max-w-2xl items-center justify-between px-5 py-5"><div className="text-sm font-bold">RESERVE <span className="text-primary">OPERATIONS</span> LAB</div><ThemeToggle /></header>
    <main className="mx-auto w-full max-w-2xl flex-1 px-5 pb-10 pt-8"><div className="mb-5 font-mono text-sm text-muted-foreground">ROOM {code} · FRIDAY REDEMPTIONS</div><h1 className="text-balance text-3xl font-bold tracking-tight">{kicked ? "You left the demo room" : "Choose your workspace"}</h1><p className="mt-3 max-w-xl text-base leading-7 text-muted-foreground">{kicked ? "An admin removed this device. You can rejoin and choose an available role again." : "Your device is connected. Pick the team you want to represent; you can change roles later."}</p>
      {error && <p role="alert" className="mt-5 rounded-md border border-destructive p-4 text-sm text-destructive">{error}</p>}
      {!preview && !error && <div className="mt-8 h-48 animate-pulse rounded-lg bg-muted" />}
      {kicked && <Button className="mt-7 w-full sm:w-auto" onClick={rejoin} disabled={busy || !preview}><RotateCcw size={17} />{busy ? "Rejoining…" : "Rejoin"}</Button>}
      {preview && !joined && !kicked && <p role="status" className="mt-8 text-sm text-muted-foreground">{busy ? "Connecting your device…" : "Preparing role selection…"}</p>}
      {preview && joined && <div className="mt-8 grid gap-3 sm:grid-cols-3">{preview.status === "ended" && <p className="rounded-md bg-secondary p-3 text-sm sm:col-span-3">The last run has ended. You can choose a role while an admin prepares the next run.</p>}{preview.roles.map(item => <button key={item.role} disabled={busy || item.claimed} onClick={() => claim(item.role)} className="flex min-h-44 flex-col items-start rounded-lg border border-border bg-card p-5 text-left transition-colors hover:border-primary hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"><span className="flex h-10 w-10 items-center justify-center rounded-md bg-secondary text-primary">{item.claimed ? <CircleCheck size={20} /> : <CircleDashed size={20} />}</span><span className="mt-5 font-semibold">{names[item.role]}</span><span className="mt-2 flex-1 text-sm leading-6 text-muted-foreground">{item.claimed ? "Taken by another device" : descriptions[item.role]}</span>{!item.claimed && <span className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-primary">Select role <ArrowRight size={16} /></span>}</button>)}{preview.roles.every(item => item.claimed) && <p className="text-sm text-muted-foreground sm:col-span-3">All roles are occupied. Ask an admin to free one, then select it here.</p>}</div>}
    </main><Disclaimer /></div>;
}
