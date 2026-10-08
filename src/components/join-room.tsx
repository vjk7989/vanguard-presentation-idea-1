"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CircleCheck, CircleDashed } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Disclaimer, ThemeToggle } from "@/components/common";
import { api, loadRoom, mutation } from "@/lib/client";
import type { Role } from "@/lib/domain";

type Preview = { code: string; runId: string; status: string; roles: { role: Role; claimed: boolean }[] };
const names: Record<Role, string> = { issuer: "Issuer treasury", fund: "Fund operations", bank: "Bank operations" };
const descriptions: Record<Role, string> = {
  issuer: "Request fund cash and approve customer payouts.",
  fund: "Accept and process the fund redemption.",
  bank: "Confirm incoming cash and completed payouts.",
};

export function JoinRoom({ code }: { code: string }) {
  const router = useRouter();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [joined, setJoined] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const check = useCallback(async () => {
    try {
      const s = await loadRoom(code);
      if (s.session.kind === "presenter") { router.replace(`/presenter/${code}`); return; }
      if (s.session.role) { router.replace(`/room/${code}`); return; }
      setJoined(true);
    } catch {}
    try { setPreview(await api<Preview>(`/api/rooms/${code}/preview`)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Room unavailable."); }
  }, [code, router]);
  useEffect(() => { queueMicrotask(() => { void check(); }); }, [check]);
  async function join() {
    if (!preview) return;
    setBusy(true); setError("");
    try { await api(`/api/rooms/${code}/join`, mutation(preview.runId)); setJoined(true); await check(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not join room."); }
    finally { setBusy(false); }
  }
  async function claim(role: Role) {
    if (!preview) return;
    setBusy(true); setError("");
    try { await api(`/api/rooms/${code}/roles/claim`, mutation(preview.runId, { role })); router.replace(`/room/${code}`); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Role unavailable."); await check(); }
    finally { setBusy(false); }
  }
  return <div className="flex min-h-screen flex-col bg-background text-foreground"><header className="mx-auto flex w-full max-w-xl items-center justify-between px-5 py-5"><div className="text-sm font-bold">RESERVE <span className="text-primary">OPERATIONS</span> LAB</div><ThemeToggle /></header>
    <main className="mx-auto w-full max-w-xl flex-1 px-5 pb-10 pt-8"><div className="mb-7 font-mono text-sm text-muted-foreground">ROOM {code}</div><h1 className="text-3xl font-bold tracking-tight">{joined ? "Choose your role" : "Join the demonstration"}</h1><p className="mt-3 text-base leading-7 text-muted-foreground">{joined ? "One device can hold one role. The first successful claim gets the position." : "Use your phone to take part in the Friday redemption scenario."}</p>
      {error && <p role="alert" className="mt-5 rounded-md border border-destructive p-4 text-sm text-destructive">{error}</p>}
      {!preview && !error && <div className="mt-8 h-48 animate-pulse rounded-lg bg-muted" />}
      {preview && !joined && <div className="mt-8"><Button className="w-full" onClick={join} disabled={busy || preview.status === "ended"}>{busy ? "Joining…" : "Join room"}<ArrowRight size={17} /></Button></div>}
      {preview && joined && <div className="mt-8 space-y-3">{preview.roles.map(item => <button key={item.role} disabled={busy || item.claimed || preview.status === "ended"} onClick={() => claim(item.role)} className="flex min-h-24 w-full items-center gap-4 rounded-lg border border-border bg-card p-4 text-left transition-colors hover:border-primary hover:bg-muted disabled:cursor-not-allowed"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-secondary text-primary">{item.claimed ? <CircleCheck size={20} /> : <CircleDashed size={20} />}</span><span className="min-w-0 flex-1"><span className="block font-semibold">{names[item.role]}</span><span className="mt-1 block text-sm text-muted-foreground">{item.claimed ? "Taken" : descriptions[item.role]}</span></span>{!item.claimed && <ArrowRight size={17} />}</button>)}{preview.roles.every(item => item.claimed) && <p className="text-sm text-muted-foreground">All roles are taken.</p>}</div>}
    </main><Disclaimer /></div>;
}
