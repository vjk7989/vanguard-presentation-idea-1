"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2, Clock3, RotateCcw, Wifi, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { Disclaimer, ThemeToggle } from "@/components/common";
import { useRoom } from "@/hooks/use-room";
import { formatMoney, type Role } from "@/lib/domain";
import { api, mutation } from "@/lib/client";
import { formatMockAmount, type MockItem } from "@/lib/mock-queue";
import type { Snapshot } from "@/lib/store";

const copy: Record<Role, { name: string; headline: string; description: string; queue: string; context: string }> = {
  issuer: { name: "Issuer treasury", headline: "Liquidity & payouts", description: "Monitor reserve cash, authorize obligations and keep the payout buffer visible.", queue: "Authorization queue", context: "Treasury policy: protect the $50m minimum cash buffer before authorizing Friday payouts." },
  fund: { name: "Fund operations", headline: "Redemptions & settlement", description: "Review redemption instructions, process fund holdings and track proceeds awaiting bank confirmation.", queue: "Redemption work queue", context: "Fund processing creates pending proceeds. They are not available bank cash until the bank confirms receipt." },
  bank: { name: "Bank operations", headline: "Payments & confirmations", description: "Verify incoming cash, match references and confirm completed payment files.", queue: "Confirmation queue", context: "Bank messages are matched by reference. A duplicate notice never credits cash twice." },
};

function RoleMetrics({ role, balances }: { role: Role; balances: Snapshot["state"]["balances"] }) {
  const metrics = role === "issuer"
    ? [["Available bank cash", balances.cash], ["Required payout buffer", balances.requiredBuffer], ["Issuer obligations", balances.obligations]]
    : role === "fund"
      ? [["Fund holdings", balances.fund], ["Proceeds awaiting bank", balances.pending], ["Friday redemption", balances.redemption]]
      : [["Available bank cash", balances.cash], ["Incoming pending", balances.pending], ["Planned payouts", balances.plannedPayout]];
  return <section aria-label={`${copy[role].name} position summary`} className="mt-7 grid gap-3 rounded-xl border border-border bg-card p-5 sm:grid-cols-3 sm:gap-0">
    {metrics.map(([label, value], index) => <div key={label} className={`min-w-0 ${index > 0 ? "border-t border-border pt-3 sm:border-t-0 sm:border-l sm:pl-5 sm:pt-0" : ""}`}><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 font-mono text-2xl font-semibold tabular-nums">{formatMoney(value)}</p></div>)}
  </section>;
}

function RoleContext({ role, state }: { role: Role; state: Snapshot["state"] }) {
  if (role === "issuer") return <div><h2 className="text-base font-semibold">Liquidity guardrail</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{copy.issuer.context}</p><div className="mt-5 flex justify-between border-t border-border pt-4 text-sm"><span>Friday payout threshold</span><strong className="font-mono">{formatMoney(BigInt(state.balances.plannedPayout) + BigInt(state.balances.requiredBuffer))}</strong></div></div>;
  if (role === "fund") return <div><h2 className="text-base font-semibold">Settlement desk</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{copy.fund.context}</p><div className="mt-5 flex justify-between border-t border-border pt-4 text-sm"><span>Friday proceeds pending</span><strong className="font-mono">{formatMoney(state.balances.pending)}</strong></div></div>;
  return <div><h2 className="text-base font-semibold">Payment rails</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{copy.bank.context}</p><div className="mt-5 space-y-2 border-t border-border pt-4 text-sm"><div className="flex flex-wrap justify-between gap-x-2"><span>Incoming confirmations</span><span className="font-semibold text-foreground">Operational</span></div><div className="flex flex-wrap justify-between gap-x-2"><span>Payout confirmations</span><span className="font-semibold text-foreground">Operational</span></div></div></div>;
}

export function ParticipantRoom({ code }: { code: string }) {
  const router = useRouter();
  const { snapshot: s, error, errorCode, connected, busy, post } = useRoom(code);
  const [rejoining, setRejoining] = useState(false);
  const [rejoinError, setRejoinError] = useState("");
  const [selected, setSelected] = useState<MockItem | null>(null);
  const [toast, setToast] = useState("");
  const role = s?.session.role;
  useEffect(() => { if (s && s.session.kind === "participant" && !s.session.role) router.replace(`/join/${code}`); }, [s, router, code]);

  async function act() {
    if (!s?.next) return;
    try { await post("actions", { action: s.next.type }); setToast("Friday scenario action accepted. Shared balances and activity are updated."); }
    catch (cause) { setToast(cause instanceof Error ? cause.message : "The action was not accepted."); }
  }
  async function approve(item: MockItem) {
    if (!s) return;
    try {
      const result = await post<{ message?: string }>(`demo-items/${item.key}/complete`, {});
      setSelected(null);
      setToast(result.message ?? `${item.title} completed.`);
    } catch (cause) { setToast(cause instanceof Error ? cause.message : "The item was not completed."); }
  }
  async function changeRole() {
    try { await post("roles/leave", {}); router.replace(`/join/${code}`); }
    catch (cause) { setToast(cause instanceof Error ? cause.message : "Could not release your role."); }
  }
  async function rejoin() {
    setRejoining(true); setRejoinError("");
    try {
      const preview = await api<{ runId: string }>(`/api/rooms/${code}/preview`);
      await api(`/api/rooms/${code}/join`, mutation(preview.runId));
      router.replace(`/join/${code}`);
    } catch (cause) { setRejoinError(cause instanceof Error ? cause.message : "Could not rejoin."); }
    finally { setRejoining(false); }
  }

  if (errorCode === "NO_SESSION") return <div className="flex min-h-screen flex-col bg-background text-foreground"><header className="mx-auto flex w-full max-w-md items-center justify-between px-5 py-5"><div className="text-sm font-bold">RESERVE <span className="text-primary">OPERATIONS</span> LAB</div><ThemeToggle /></header><main className="mx-auto w-full max-w-md flex-1 px-5 pt-12"><h1 className="text-3xl font-bold">You left the demo room</h1><p className="mt-4 leading-7 text-muted-foreground">An admin removed this device. Scan the room QR code or press Rejoin to choose an available role.</p><Button className="mt-8 w-full" onClick={rejoin} disabled={rejoining}>{rejoining ? "Rejoining…" : "Rejoin"}<ArrowRight size={17} /></Button>{rejoinError && <p role="alert" className="mt-4 text-sm text-destructive">{rejoinError}</p>}</main><Disclaimer /></div>;
  if (!s || !role) return <div className="mx-auto max-w-5xl p-5"><div className="h-12 animate-pulse rounded bg-muted" /><div className="mt-8 h-64 animate-pulse rounded bg-muted" />{error && <p role="alert" className="mt-4 text-destructive">{error}</p>}</div>;

  const mine = Boolean(s.next?.role === role);
  const blocked = s.state.bankDelayed && s.next?.type === "confirm_proceeds";
  const actionAllowed = connected && !busy && mine && s.status === "active" && !blocked;
  const items = s.mockItems.filter(item => item.role === role);
  const activities = s.events.filter(event => event.actor === role || event.onBehalfOf === role).slice(-4).reverse();
  const statusText = s.status === "paused" ? "The admin paused this run. Actions are unavailable." : s.status === "lobby" ? "The admin will start the scenario shortly." : s.status === "ended" ? "This run has ended. The admin can start a fresh run." : blocked && mine ? "$200m proceeds remain pending until the bank delay is released." : mine ? "Check the amount and submit the next confirmed step." : s.next ? `${copy[s.next.role].name} owns the next Friday step.` : "All six Friday steps are complete.";
  return <div className="flex min-h-screen flex-col bg-background text-foreground"><header className="border-b border-border"><div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3 sm:px-8"><div className="text-sm font-bold">RESERVE <span className="text-primary">OPERATIONS</span> LAB</div><ThemeToggle /></div></header>
    <main className="mx-auto w-full max-w-6xl flex-1 px-5 pb-10 pt-7 sm:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3"><span className="font-mono text-xs text-muted-foreground">ROOM {s.code} · RUN {s.runNumber} · SIMULATION ONLY</span><span className={`flex items-center gap-1 text-xs ${connected ? "text-foreground" : "text-destructive"}`}>{connected ? <Wifi size={14} /> : <WifiOff size={14} />}{connected ? "Connected" : "Offline"}</span></div>
      <div className="mt-6 flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm font-semibold text-primary">{copy[role].name}</p><h1 className="mt-1 text-balance text-3xl font-bold tracking-tight sm:text-4xl">{copy[role].headline}</h1><p className="mt-3 max-w-2xl leading-7 text-muted-foreground">{copy[role].description}</p></div><Button variant="secondary" onClick={changeRole} disabled={!connected || busy}><RotateCcw size={16} /> Change role</Button></div>
      {error && <p role="alert" className="mt-5 rounded-md border border-destructive p-4 text-sm text-destructive">{error}{!connected && " Actions are disabled until the connection returns."}</p>}
      {toast && <div role="status" aria-live="polite" className="mt-5 flex items-start justify-between gap-3 rounded-md bg-secondary p-4 text-sm"><span>{toast}</span><button aria-label="Dismiss message" onClick={() => setToast("")} className="font-semibold text-primary">Dismiss</button></div>}
      <RoleMetrics role={role} balances={s.state.balances} />
      <section className="mt-6 rounded-xl border border-primary/30 bg-primary/5 p-5 sm:p-6" aria-label="Main Friday scenario action"><div className="flex flex-wrap items-start justify-between gap-4"><div className="max-w-2xl"><div className="flex items-center gap-2 text-sm font-semibold text-primary">{mine ? <ArrowRight size={17} /> : s.state.step === 6 ? <CheckCircle2 size={17} /> : <Clock3 size={17} />}{mine ? "NEXT DEMO ACTION · YOUR TURN" : "FRIDAY SCENARIO · MAIN TASK"}</div><h2 className="mt-3 text-xl font-semibold sm:text-2xl">{mine ? s.next?.label : s.state.step === 6 ? "Friday run complete" : s.next ? `${copy[s.next.role].name} acts next` : "Waiting for the admin to start"}</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">{statusText}</p></div>{mine && <Button className="w-full sm:w-auto" disabled={!actionAllowed} onClick={act}>{busy ? "Submitting…" : s.next?.label}<ArrowRight size={17} /></Button>}</div></section>
      <div className="mt-7 grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1.7fr)_minmax(280px,.8fr)]"><section className="min-w-0"><div className="flex flex-wrap items-end justify-between gap-3"><div className="min-w-0 flex-1"><h2 className="text-xl font-semibold">{copy[role].queue}</h2><p className="mt-1 text-sm text-muted-foreground">Fictional background work · independent of Friday reserve balances</p></div><span className="font-mono text-sm text-muted-foreground">{items.filter(item => item.status === "pending").length} pending</span></div>
        <div className="mt-4 overflow-hidden rounded-xl border border-border bg-card"><div className="hidden grid-cols-[minmax(0,1.3fr)_minmax(0,.8fr)_auto_auto] gap-4 border-b border-border bg-muted px-5 py-3 text-xs font-semibold text-muted-foreground sm:grid"><span>Item / counterparty</span><span>Reference</span><span>Status</span><span className="text-right">Amount</span></div>{items.map(item => <button key={item.key} onClick={() => setSelected(item)} className="grid min-w-0 w-full grid-cols-[minmax(0,1fr)] gap-3 border-b border-border px-5 py-4 text-left last:border-b-0 hover:bg-muted focus-visible:bg-muted sm:grid-cols-[minmax(0,1.3fr)_minmax(0,.8fr)_auto_auto] sm:items-center sm:gap-4"><span className="min-w-0"><strong className="block text-sm font-semibold">{item.title}</strong><span className="mt-1 block text-xs text-muted-foreground">{item.counterparty}</span></span><span className="min-w-0 break-all font-mono text-xs text-muted-foreground">{item.reference}</span><span className={`w-fit rounded-full px-2 py-1 text-xs font-semibold ${item.status === "complete" ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100" : "bg-secondary text-secondary-foreground"}`}>{item.status === "complete" ? item.completedLabel : "Needs review"}</span><span className="font-mono text-sm font-semibold sm:text-right">{formatMockAmount(item.amount)}</span></button>)}</div>
      </section><aside className="space-y-6"><section className="rounded-xl border border-border bg-card p-5"><RoleContext role={role} state={s.state} /></section><section className="rounded-xl border border-border bg-card p-5"><h2 className="text-base font-semibold">Recent desk activity</h2>{activities.length ? <ul className="mt-4 space-y-4">{activities.map(event => <li key={event.id} className="border-t border-border pt-3 text-sm leading-6">{event.label}<span className="mt-1 block text-xs text-muted-foreground">{new Date(event.createdAt).toLocaleTimeString()}</span></li>)}</ul> : <p className="mt-3 text-sm text-muted-foreground">Your accepted actions will appear here.</p>}</section></aside></div>
      <p className="mt-8 text-xs text-muted-foreground">Last sync: {new Date(s.serverTime).toLocaleTimeString()}</p>
    </main>
    <Sheet open={Boolean(selected)} onOpenChange={open => !open && setSelected(null)} title={selected?.title ?? "Work item"}>{selected && <div className="space-y-5 text-sm"><p className="leading-7 text-muted-foreground">{selected.note}</p><dl className="grid grid-cols-[7rem_1fr] gap-y-3 border-y border-border py-5"><dt className="text-muted-foreground">Counterparty</dt><dd>{selected.counterparty}</dd><dt className="text-muted-foreground">Amount</dt><dd className="font-mono font-semibold">{formatMockAmount(selected.amount)}</dd><dt className="text-muted-foreground">Reference</dt><dd className="break-all font-mono">{selected.reference}</dd><dt className="text-muted-foreground">Status</dt><dd>{selected.status === "complete" ? selected.completedLabel : "Needs review"}</dd></dl>{selected.status === "pending" ? <Button className="w-full" disabled={!connected || busy || s.status !== "active"} onClick={() => approve(selected)}>{busy ? "Submitting…" : selected.action}<ArrowRight size={16} /></Button> : <p className="rounded-md bg-secondary p-4">This simulated item is already {selected.completedLabel.toLowerCase()}. No reserve balance changed.</p>}<p className="text-xs leading-5 text-muted-foreground">Background items are simulated operations; only the highlighted Friday action changes the shared reserve scenario.</p></div>}</Sheet>
    <Disclaimer />
  </div>;
}
