"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CircleCheck, Clock3, Wifi, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Disclaimer, ThemeToggle } from "@/components/common";
import { useRoom } from "@/hooks/use-room";
import { formatMoney, type Role } from "@/lib/domain";
import { api, mutation } from "@/lib/client";

const names: Record<Role, string> = { issuer: "Issuer treasury", fund: "Fund operations", bank: "Bank operations" };

export function ParticipantRoom({ code }: { code: string }) {
  const router = useRouter();
  const { snapshot: s, error, errorCode, connected, busy, post } = useRoom(code);
  const [rejoining, setRejoining] = useState(false);
  const [rejoinError, setRejoinError] = useState("");
  const role = s?.session.role;
  useEffect(() => { if (s && s.session.kind === "participant" && !s.session.role) router.replace(`/join/${code}`); }, [s, router, code]);
  async function act() { if (!s?.next) return; try { await post("actions", { action: s.next.type }); } catch {} }
  async function rejoin() {
    setRejoining(true); setRejoinError("");
    try {
      const preview = await api<{ runId: string }>(`/api/rooms/${code}/preview`);
      await api(`/api/rooms/${code}/join`, mutation(preview.runId));
      router.replace(`/join/${code}`);
    } catch (cause) { setRejoinError(cause instanceof Error ? cause.message : "Could not rejoin."); }
    finally { setRejoining(false); }
  }
  if (errorCode === "NO_SESSION") return <div className="flex min-h-screen flex-col bg-background text-foreground"><header className="mx-auto flex w-full max-w-md items-center justify-between px-5 py-5"><div className="text-sm font-bold">RESERVE <span className="text-primary">OPERATIONS</span> LAB</div><ThemeToggle /></header><main className="mx-auto w-full max-w-md flex-1 px-5 pt-12"><h1 className="text-3xl font-bold">You left the demo room</h1><p className="mt-4 leading-7 text-muted-foreground">Your role is available again. Scan the room QR code or press Rejoin to choose a role.</p><Button className="mt-8 w-full" onClick={rejoin} disabled={rejoining}>{rejoining ? "Rejoining…" : "Rejoin"}<ArrowRight size={17} /></Button>{rejoinError && <p role="alert" className="mt-4 text-sm text-destructive">{rejoinError}</p>}</main><Disclaimer /></div>;
  if (!s) return <div className="mx-auto max-w-md p-5"><div className="h-12 animate-pulse rounded bg-muted" /><div className="mt-8 h-64 animate-pulse rounded bg-muted" />{error && <p role="alert" className="mt-4 text-destructive">{error}</p>}</div>;
  const mine = Boolean(role && s.next?.role === role);
  const blocked = s.state.bankDelayed && s.next?.type === "confirm_proceeds";
  const actionAllowed = connected && !busy && mine && s.status === "active" && !blocked;
  const relevant = role === "fund" ? s.state.balances.fund : s.state.balances.cash;
  const activities = s.events.filter(event => event.actor === role || event.onBehalfOf === role).slice(-3).reverse();
  return <div className="flex min-h-screen flex-col bg-background text-foreground"><header className="border-b border-border"><div className="mx-auto flex max-w-md items-center justify-between px-5 py-3"><div className="text-sm font-bold">RESERVE <span className="text-primary">OPERATIONS</span> LAB</div><ThemeToggle /></div></header>
    <main className="mx-auto w-full max-w-md flex-1 px-5 pb-8 pt-7">
      <div className="flex items-center justify-between gap-3"><span className="font-mono text-xs text-muted-foreground">ROOM {s.code}</span><span className={`flex items-center gap-1 text-xs ${connected ? "text-foreground" : "text-destructive"}`}>{connected ? <Wifi size={14} /> : <WifiOff size={14} />}{connected ? "Connected" : "Offline"}</span></div>
      <h1 className="mt-5 text-3xl font-bold tracking-tight">{role ? names[role] : "Waiting for role"}</h1>
      <p className="mt-2 font-mono text-xs text-muted-foreground">{s.roles.find(item => item.role === role)?.walletId ?? "No demo ID assigned"}</p>
      {error && <p role="alert" className="mt-6 rounded-md border border-destructive p-4 text-sm text-destructive">{error} Actions are disabled until the connection returns.</p>}
      <section className="mt-9 border-t border-border pt-6">
        <div className="flex items-center gap-2 text-sm font-semibold text-primary">{mine ? <ArrowRight size={17} /> : s.state.step === 6 ? <CircleCheck size={17} /> : <Clock3 size={17} />}{mine ? "Your task" : s.state.step === 6 ? "Scenario complete" : "Waiting for next action"}</div>
        <h2 className="mt-4 text-2xl font-semibold leading-tight">{mine ? s.next?.label : s.state.step === 6 ? "All six steps are complete" : s.next ? `${names[s.next.role]} acts next` : "The presenter will start the scenario"}</h2>
        <p className="mt-4 text-base leading-7 text-muted-foreground">{blocked && mine ? "$200m remains pending. The bank has not confirmed receipt." : s.status === "paused" ? "The presenter paused this run. No transaction actions are available." : s.status === "lobby" ? "The presenter will start when the room is ready." : mine ? "Check the amount and confirm your action. The shared state updates after the server accepts it." : "You will see one action here when it is your turn."}</p>
        {mine && <Button className="mt-7 w-full" disabled={!actionAllowed} onClick={act}>{busy ? "Submitting…" : s.next?.label}<ArrowRight size={17} /></Button>}
        {blocked && mine && <p className="mt-3 text-sm text-muted-foreground">The presenter can release the delayed bank confirmation.</p>}
      </section>
      <section className="mt-9 grid grid-cols-2 gap-5 border-y border-border py-5" aria-label="Relevant balances"><div><div className="text-xs text-muted-foreground">{role === "fund" ? "Fund holdings" : "Available bank cash"}</div><div className="mt-1 font-mono text-xl font-semibold">{formatMoney(relevant)}</div></div><div><div className="text-xs text-muted-foreground">Pending proceeds</div><div className="mt-1 font-mono text-xl font-semibold">{formatMoney(s.state.balances.pending)}</div></div></section>
      <section className="mt-8"><h2 className="text-base font-semibold">Your activity</h2>{activities.length ? <ul className="mt-3 space-y-3">{activities.map(event => <li key={event.id} className="border-b border-border pb-3 text-sm leading-6">{event.label}<span className="mt-1 block text-xs text-muted-foreground">{new Date(event.createdAt).toLocaleTimeString()}</span></li>)}</ul> : <p className="mt-3 text-sm text-muted-foreground">Your actions will appear here.</p>}</section>
      <p className="mt-8 text-xs text-muted-foreground">Last sync: {new Date(s.serverTime).toLocaleTimeString()}</p>
    </main><Disclaimer /></div>;
}
