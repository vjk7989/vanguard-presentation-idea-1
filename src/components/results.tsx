"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { ArrowLeft, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Disclaimer, ThemeToggle } from "@/components/common";
import { useRoom } from "@/hooks/use-room";
import { api } from "@/lib/client";
import { formatMoney, type SerializedBalances } from "@/lib/domain";
import type { WireEvent } from "@/lib/store";
import type { DemoCase, CaseStatus } from "@/lib/demo-cases";
import type { MockItem, MockStatus } from "@/lib/mock-queue";
import { MOCK_INITIAL_STATUS } from "@/lib/mock-queue";

type Replay = { runId: string; runNumber: number; scenarioVersion: number; opening: SerializedBalances; closing: SerializedBalances; events: WireEvent[]; mockItems?: MockItem[]; cases?: DemoCase[] };
const financialTypes = new Set(["request_redemption", "accept_redemption", "process_redemption", "confirm_proceeds", "approve_payouts", "confirm_payouts"]);
export function Results({ code }: { code: string }) {
  const reduced = useReducedMotion();
  const router = useRouter();
  const { snapshot: s, connected, busy, error, post } = useRoom(code);
  const [selectedRun, setSelectedRun] = useState("");
  const [replay, setReplay] = useState<Replay | null>(null);
  const [position, setPosition] = useState<number | null>(null);
  const activeRun = selectedRun || s?.runId || "";
  useEffect(() => { if (activeRun) api<Replay>(`/api/rooms/${code}/runs/${activeRun}`).then(setReplay).catch(() => setReplay(null)); }, [code, activeRun, s?.revision]);
  if (!s) return <div className="mx-auto max-w-5xl p-8"><div className="h-40 animate-pulse rounded-xl bg-muted" />{error && <p role="alert" className="mt-4 text-destructive">{error}</p>}</div>;
  const allEvents = replay?.events ?? [];
  const step = position === null ? allEvents.length : Math.min(position, allEvents.length);
  const current = step ? allEvents[step - 1] : null;
  const financialCount = allEvents.slice(0, step).filter(event => financialTypes.has(event.type)).length;
  const balances = current ? (current.stateAfter as { balances: SerializedBalances }).balances : replay?.opening ?? s.state.balances;
  const queueState = current ? (current.stateAfter as { demoQueue?: Record<string, MockStatus> }).demoQueue : undefined;
  const caseState = current ? (current.stateAfter as { demoCases?: Record<string, CaseStatus> }).demoCases : undefined;
  const exceptions = replay?.events.filter(event => ["delay_bank", "release_bank", "repeat_bank"].includes(event.type)) ?? [];
  async function restart() { try { await post("controls", { control: "reset" }); router.push(`/presenter/${code}`); } catch {} }
  return <div className="flex min-h-screen flex-col bg-background text-foreground"><header className="border-b border-border"><div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4 sm:px-8"><div className="text-sm font-bold">RESERVE <span className="text-primary">OPERATIONS</span> LAB</div><ThemeToggle /></div></header>
    <main className="mx-auto w-full max-w-5xl flex-1 px-5 pb-12 pt-7 sm:px-8"><Link href={`/presenter/${code}`} className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary"><ArrowLeft size={17} /> Back to room</Link>
      <div className="mt-5 flex flex-wrap items-end justify-between gap-5"><div><p className="font-mono text-xs text-muted-foreground">ROOM {code}</p><h1 className="mt-2 text-3xl font-bold tracking-tight">Results and replay</h1><p className="mt-3 text-muted-foreground">Review the balances and decisions from any run in this room.</p></div>{s.session.kind === "presenter" && <Button variant="secondary" onClick={restart} disabled={!connected || busy}><RotateCcw size={16} /> Restart with same roles</Button>}</div>
      {error && <p role="alert" className="mt-5 text-sm text-destructive">{error}</p>}
      <div className="mt-9 flex flex-wrap items-center gap-3"><label htmlFor="run-select" className="text-sm font-semibold">Run</label><select id="run-select" value={activeRun} onChange={e => { setSelectedRun(e.target.value); setPosition(null); }} className="h-11 rounded-md border border-border bg-background px-3 text-sm">{s.runs.map(run => <option key={run.id} value={run.id}>Run {run.runNumber}{run.id === s.runId ? " (current)" : ""}</option>)}</select><span className="text-sm text-muted-foreground">{financialCount} of 6 financial steps · {replay?.scenarioVersion === 1 ? "Original $200m variant" : "Deck-aligned $150m variant"}</span></div>
      <section className="mt-7 overflow-x-auto border-y border-border py-5"><h2 className="mb-4 text-lg font-semibold">Opening and current balances</h2><table className="w-full min-w-[580px] text-left text-sm"><thead><tr className="text-muted-foreground"><th className="pb-3 font-medium">Measure</th><th className="pb-3 font-medium">Opening</th><th className="pb-3 font-medium">At replay point</th></tr></thead><tbody>{(["cash", "fund", "pending", "obligations"] as const).map(key => <tr key={key} className="border-t border-border"><th className="py-3 font-medium">{{ cash: "Available bank cash", fund: "Fund holdings", pending: "Pending proceeds", obligations: "Issuer obligations" }[key]}</th><td className="py-3 font-mono">{formatMoney((replay?.opening ?? s.state.balances)[key])}</td><td className="py-3 font-mono font-semibold">{formatMoney(balances[key])}</td></tr>)}</tbody></table></section>
      <section className="mt-8"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">Replay every accepted event</h2><span className="font-mono text-sm text-muted-foreground">Event {step} / {allEvents.length}</span></div><input type="range" min={0} max={allEvents.length} value={step} onChange={e => setPosition(Number(e.target.value))} aria-label="Replay event" className="mt-5 w-full accent-primary" /><div className="mt-2 flex justify-between text-xs text-muted-foreground"><span>Opening</span><span>Latest</span></div><motion.div key={`${selectedRun}-${step}`} initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: reduced ? 0 : 0.2 }} className="mt-5 min-h-24 rounded-lg border border-border bg-card p-5"><div className="text-xs font-semibold text-primary">{current ? `EVENT ${step} · ${financialCount} OF 6 FINANCIAL STEPS` : "OPENING STATE"}</div><p className="mt-2 text-base leading-7">{current?.label ?? "The room starts with $300m bank cash, $1.7bn fund holdings, and $2bn obligations."}</p></motion.div></section>
      {(replay?.mockItems?.length ?? 0) > 0 && <section className="mt-9 border-t border-border pt-7"><h2 className="text-lg font-semibold">Background work at this replay point</h2><p className="mt-2 text-sm text-muted-foreground">Fictional queue approvals are recorded but never change reserve balances.</p><div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{replay?.mockItems?.map(item => { const status = queueState?.[item.key] ?? (step === 0 ? MOCK_INITIAL_STATUS[item.key] : item.status); return <div key={item.key} className="rounded-lg border border-border bg-card p-4"><div className="text-sm font-semibold">{item.title}</div><div className="mt-1 font-mono text-xs text-muted-foreground">{item.reference}</div><div className="mt-3 text-sm">{status === "complete" ? item.completedLabel : "Needs review"}</div></div>; })}</div></section>}
      {(replay?.cases?.length ?? 0) > 0 && <section className="mt-9 border-t border-border pt-7"><h2 className="text-lg font-semibold">Practice coordination at this replay point</h2><p className="mt-2 text-sm text-muted-foreground">Issuer, Fund and Bank messages are linked events. Their display amounts never change reserves.</p><div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{replay?.cases?.filter(item => step === allEvents.length || caseState?.[item.reference]).map(item => <div key={item.id} className="rounded-lg border border-border bg-card p-4"><p className="font-mono text-sm font-semibold">{item.reference} · {formatMoney(item.amount)}</p><p className="mt-2 text-sm">{({ opened: "Waiting for Fund", fund_reviewed: "Waiting for Bank", bank_acknowledged: "Bank acknowledged" } as const)[caseState?.[item.reference] ?? item.status]}</p></div>)}</div></section>}
      <section className="mt-9 grid gap-7 border-t border-border pt-7 md:grid-cols-2"><div><h2 className="text-lg font-semibold">Exceptions encountered</h2>{exceptions.length ? <ul className="mt-3 space-y-2 text-sm leading-6">{exceptions.map(event => <li key={event.id}>{event.label}</li>)}</ul> : <p className="mt-3 text-sm text-muted-foreground">No exception was used in this run.</p>}</div><div><h2 className="text-lg font-semibold">What this shows</h2><p className="mt-3 text-sm leading-7">An accepted fund request is separate from available bank cash. A shared workflow history can make responsibilities visible across firms. Its commercial value still needs a measured pilot.</p><p className="mt-3 text-sm leading-7 text-muted-foreground">The demonstration does not establish faster settlement, lower cost, or an actual blockchain deployment.</p></div></section>
    </main><Disclaimer /></div>;
}
