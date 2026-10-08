"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, CircleCheck, CircleDashed, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Disclaimer, ThemeToggle } from "@/components/common";
import { api, loadRoom, mutation, type ApiError } from "@/lib/client";
import type { Role } from "@/lib/domain";
import { getIdeaSpec, IDEA_TITLES, roleTitle, type IdeaKey } from "@/lib/ideas";
import type { Snapshot } from "@/lib/store";

type Preview = { code: string; runId: string; status: string; ideaKey: IdeaKey; roles: { role: Role; title: string; claimed: boolean }[] };
const descriptions: Partial<Record<Role, string>> = {
  issuer: "Manage liquidity and payout authorizations.",
  fund: "Review redemption batches and settlement.",
  bank: "Confirm incoming wires and payment files.",
};

function roleDescription(ideaKey: IdeaKey, role: Role): string {
  return descriptions[role] ?? getIdeaSpec(ideaKey)?.roles.find(item => item.id === role)?.responsibility ?? "Join this operational desk.";
}

export function JoinRoom({ code }: { code: string }) {
  const router = useRouter();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [joined, setJoined] = useState(false);
  const [kicked, setKicked] = useState(false);
  const [adminSession, setAdminSession] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const joinedRef = useRef(false);
  const inFlight = useRef(false);
  const joinedMarker = `reserve-lab-participant:${code}`;

  const acceptRoom = useCallback((room: Snapshot) => {
    setPreview({ code: room.code, runId: room.runId, status: room.status, ideaKey: room.ideaKey,
      roles: room.roles.map(item => ({ role: item.role, title: roleTitle(room.ideaKey, item.role), claimed: item.claimed })) });
    if (room.session.kind === "presenter") {
      setAdminSession(true); setJoined(false); setKicked(false); setError("");
      return;
    }
    setAdminSession(false);
    joinedRef.current = true;
    try { window.localStorage.setItem(joinedMarker, "1"); } catch { /* Private storage may be unavailable. */ }
    if (room.session.role) { router.replace(`/room/${code}`); return; }
    setJoined(true); setKicked(false); setError("");
  }, [code, joinedMarker, router]);

  const register = useCallback(async (current: Preview) => {
    setBusy(true); setError("");
    try {
      const joinOnce = async () => {
        // A second tab can reuse the first tab's HTTP-only cookie after its join completes.
        try { acceptRoom(await loadRoom(code)); return; }
        catch (cause) { if ((cause as ApiError).code !== "NO_SESSION") throw cause; }
        await api(`/api/rooms/${code}/join`, mutation(current.runId));
        acceptRoom(await loadRoom(code));
      };
      if (navigator.locks?.request) await navigator.locks.request(`reserve-lab-join:${code}`, joinOnce);
      else await joinOnce();
    } catch (cause) {
      if ((cause as ApiError).code === "ADMIN_SESSION") setAdminSession(true);
      else setError(cause instanceof Error ? cause.message : "Could not join the room.");
    }
    finally { setBusy(false); }
  }, [acceptRoom, code]);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const room = await loadRoom(code);
      acceptRoom(room);
    } catch (cause) {
      if ((cause as ApiError).code !== "NO_SESSION") {
        setError(cause instanceof Error ? cause.message : "Room unavailable.");
        return;
      }
      try {
        const current = await api<Preview>(`/api/rooms/${code}/preview`);
        setPreview(current);
        let previouslyJoined = joinedRef.current;
        try { previouslyJoined ||= window.localStorage.getItem(joinedMarker) === "1"; } catch { /* Private storage may be unavailable. */ }
        if (previouslyJoined) { setKicked(true); setJoined(false); setError(""); return; }
        if (!joinedRef.current) await register(current);
      } catch (previewError) {
        setError(previewError instanceof Error ? previewError.message : "Room unavailable.");
      }
    } finally { inFlight.current = false; }
  }, [acceptRoom, code, joinedMarker, register]);

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

  return <div className="flex min-h-screen flex-col bg-background text-foreground">
    <header className="mx-auto flex w-full max-w-4xl items-center justify-between px-5 py-5"><div className="text-sm font-bold">RESERVE <span className="text-primary">OPERATIONS</span> LAB</div><ThemeToggle /></header>
    <main className="mx-auto w-full max-w-4xl flex-1 px-5 pb-10 pt-8">
      <p className="mb-5 font-mono text-sm text-muted-foreground">ROOM {code} · IDEA {preview?.ideaKey ?? 1} · {IDEA_TITLES[preview?.ideaKey ?? 1]}</p>
      <h1 className="text-balance text-3xl font-bold tracking-tight">{adminSession ? "This profile is the admin" : kicked ? "You left the demo room" : "Choose your workspace"}</h1>
      <p className="mt-3 max-w-2xl text-base leading-7 text-muted-foreground">{adminSession ? "Chrome tabs in this profile share the admin session. Open the QR link in another Chrome profile or device to choose a participant role." : kicked ? "An admin removed this device. You can rejoin and choose an available role again." : "Your device is connected. Select an available desk for this idea. You can change roles later without scanning again."}</p>
      {error && <p role="alert" className="mt-5 rounded-md border border-destructive p-4 text-sm text-destructive">{error}</p>}
      {!preview && !error && !adminSession && <div className="mt-8 h-48 animate-pulse rounded-lg bg-muted" />}
      {adminSession && <Link href={`/presenter/${code}`} className="mt-7 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:w-auto">Return to admin dashboard <ArrowRight size={17} /></Link>}
      {kicked && !adminSession && <Button className="mt-7 w-full sm:w-auto" onClick={rejoin} disabled={busy || !preview}><RotateCcw size={17} />{busy ? "Rejoining…" : "Rejoin"}</Button>}
      {preview && !joined && !kicked && !adminSession && <p role="status" className="mt-8 text-sm text-muted-foreground">{busy ? "Connecting your device…" : "Preparing role selection…"}</p>}
      {preview && joined && !adminSession && <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {preview.status === "ended" && <p className="rounded-md bg-secondary p-3 text-sm sm:col-span-2 lg:col-span-3">The last run has ended. You can choose a role while an admin prepares the next run.</p>}
        {preview.roles.map(item => <button key={item.role} type="button" disabled={busy || item.claimed} onClick={() => claim(item.role)} aria-label={`${getIdeaSpec(preview.ideaKey)?.roles.find(desk => desk.id === item.role)?.organization ?? "Demo"} · ${item.title}${item.claimed ? " · taken" : " · available"}`} className="flex min-h-44 flex-col items-start rounded-lg border border-border bg-card p-5 text-left transition-colors hover:border-primary hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-60"><span className="flex h-10 w-10 items-center justify-center rounded-md bg-secondary text-primary">{item.claimed ? <CircleCheck size={20} aria-hidden="true" /> : <CircleDashed size={20} aria-hidden="true" />}</span><span className="mt-5 font-semibold">{item.title}</span><span className="mt-2 flex-1 text-sm leading-6 text-muted-foreground">{item.claimed ? "Taken by another device" : roleDescription(preview.ideaKey, item.role)}</span>{!item.claimed && <span className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-primary">Select role <ArrowRight size={16} aria-hidden="true" /></span>}</button>)}
        {preview.roles.every(item => item.claimed) && <p className="text-sm text-muted-foreground sm:col-span-2 lg:col-span-3">All roles are occupied. Ask an admin to free one, then select it here.</p>}
      </div>}
    </main><Disclaimer />
  </div>;
}
