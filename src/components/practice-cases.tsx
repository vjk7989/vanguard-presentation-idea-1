"use client";
import { useState } from "react";
import { ArrowRight, CheckCircle2, Clock3, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { formatMoney, type Role } from "@/lib/domain";
import { nextCaseRole, type CasePreset, type DemoCase } from "@/lib/demo-cases";

const roleNames: Partial<Record<Role, string>> = { issuer: "Issuer Treasury", fund: "Vanguard Fund Operations", bank: "Bank Payments" };
const stageCopy: Record<DemoCase["status"], string> = {
  opened: "Issuer sent request · Fund review pending",
  fund_reviewed: "Fund reviewed request · Bank response pending",
  bank_acknowledged: "Bank sent status response to Issuer",
};

export function PracticeCases({ role, cases, active, connected, busy, compact = false, onCreate, onAdvance }: {
  role: Role; cases: DemoCase[]; active: boolean; connected: boolean; busy: boolean; compact?: boolean;
  onCreate: (preset: CasePreset) => Promise<void>; onAdvance: (item: DemoCase) => Promise<void>;
}) {
  const [preset, setPreset] = useState<CasePreset>("10m");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = cases.find(item => item.id === selectedId) ?? null;
  const assigned = cases.filter(item => nextCaseRole(item.status) === role);
  const visible = compact ? [...assigned, ...cases.filter(item => nextCaseRole(item.status) !== role).slice(-2)].slice(0, 3) : [...cases].reverse();
  const enabled = active && connected && !busy;
  return <section className="space-y-4" aria-label="Practice coordination cases">
    <div className="flex flex-wrap items-end justify-between gap-2"><div><h2 className="text-xl font-semibold">Practice coordination</h2><p className="mt-1 max-w-xl text-sm leading-6 text-muted-foreground">Repeatable messages across Issuer, Fund and Bank. Display amounts are fictional; no reserve cash moves.</p></div><span className="font-mono text-xs text-muted-foreground">{assigned.length} for your desk · {cases.length}/20 opened</span></div>
    {role === "issuer" && <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-4 sm:p-5"><div className="flex-1"><p className="text-sm font-semibold">Send a new practice request to Fund</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Use this to show the request path. The main Friday action above is separate.</p></div><label className="text-xs font-semibold" htmlFor="case-preset">Display amount<select id="case-preset" value={preset} onChange={event => setPreset(event.target.value as CasePreset)} className="mt-1 block h-11 min-w-24 rounded-md border border-border bg-background px-3 text-sm"><option value="5m">$5m</option><option value="10m">$10m</option><option value="25m">$25m</option></select></label><Button disabled={!enabled || cases.length >= 20} onClick={() => onCreate(preset)}><Send size={16} aria-hidden="true" /> Send practice request</Button></div>}
    {visible.length ? <div className="overflow-hidden rounded-xl border border-border bg-card">{visible.map(item => {
      const mine = nextCaseRole(item.status) === role;
      return <button key={item.id} type="button" onClick={() => setSelectedId(item.id)} className="flex min-h-20 w-full items-center justify-between gap-3 border-b border-border px-4 py-3 text-left last:border-b-0 hover:bg-muted focus-visible:bg-muted sm:px-5" aria-label={`Open ${item.reference}, ${stageCopy[item.status]}`}><span className="min-w-0"><span className="block font-mono text-sm font-semibold">{item.reference} · {formatMoney(item.amount)}</span><span className="mt-1 block text-xs leading-5 text-muted-foreground">{stageCopy[item.status]}</span></span><span className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold ${mine ? "bg-primary/10 text-primary" : "bg-secondary text-secondary-foreground"}`}>{mine ? "Your turn" : item.status === "bank_acknowledged" ? "Complete" : "View"}</span></button>;
    })}</div> : <div className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">{role === "issuer" ? "Create a practice request to start a repeatable workflow." : `Waiting for ${role === "fund" ? "Issuer to send" : "Fund to forward"} a practice request.`}</div>}
    {!compact && <p className="text-xs leading-5 text-muted-foreground">Sample desk transactions below are separate from these accepted live case events and from the Friday reserve balances.</p>}
    <Sheet open={Boolean(selected)} onOpenChange={open => !open && setSelectedId(null)} title={selected?.reference ?? "Practice case"}>{selected && <div className="space-y-5 text-sm"><div className="inline-flex items-center gap-2 rounded-full bg-secondary px-3 py-2 font-semibold">{selected.status === "bank_acknowledged" ? <CheckCircle2 size={16} aria-hidden="true" /> : <Clock3 size={16} aria-hidden="true" />}{stageCopy[selected.status]}</div><p className="leading-7 text-muted-foreground">This fictional coordination case lets the three desks exchange a request and status evidence. It does not redeem fund shares or confirm real bank cash.</p><dl className="grid grid-cols-[7rem_1fr] gap-y-3 border-y border-border py-5"><dt className="text-muted-foreground">Display amount</dt><dd className="font-mono font-semibold">{formatMoney(selected.amount)}</dd><dt className="text-muted-foreground">Reference</dt><dd className="font-mono">{selected.reference}</dd><dt className="text-muted-foreground">Next team</dt><dd>{selected.nextRole ? roleNames[selected.nextRole] : "Case complete"}</dd><dt className="text-muted-foreground">Opened</dt><dd>{new Date(selected.createdAt).toLocaleString()}</dd></dl>{selected.nextRole === role && <Button className="w-full" disabled={!enabled} onClick={async () => { await onAdvance(selected); setSelectedId(null); }}>{busy ? "Submitting…" : role === "fund" ? "Review & forward to Bank" : "Acknowledge status to Issuer"} <ArrowRight size={16} aria-hidden="true" /></Button>}<p className="text-xs leading-5 text-muted-foreground">Practice only · no financial balance changes · accepted actions appear in the shared timeline.</p></div>}</Sheet>
  </section>;
}
