"use client";
import { ArrowDown, ArrowLeft, ArrowRight, Check, Clock3, Link2, Radio, Users } from "lucide-react";
import { formatMoney, type Role } from "@/lib/domain";
import type { Snapshot, WireEvent } from "@/lib/store";

type Party = "issuer" | "fund" | "bank" | "holders";
type Flow = { source: Party; target: Party; cash: boolean; label: string };
const names: Record<Party, string> = {
  issuer: "Issuer Treasury", fund: "Fund Operations", bank: "Banking Operations", holders: "Token holders",
};
const descriptions: Record<Party, string> = {
  issuer: "Owns reserves and payout decisions",
  fund: "Reviews and redeems fund shares",
  bank: "Confirms received and paid cash",
  holders: "Receive the simulated payout",
};

function flowFor(type: string): Flow | null {
  switch (type) {
    case "request_redemption": case "case_opened":
      return { source: "issuer", target: "fund", cash: false, label: "Request sent to fund" };
    case "accept_redemption":
      return { source: "fund", target: "issuer", cash: false, label: "Fund acceptance returned" };
    case "process_redemption": case "case_fund_reviewed":
      return { source: "fund", target: "bank", cash: false, label: "Fund status sent to bank" };
    case "confirm_proceeds":
      return { source: "fund", target: "bank", cash: true, label: "Bank confirmed fund proceeds" };
    case "case_bank_acknowledged":
      return { source: "bank", target: "issuer", cash: false, label: "Bank acknowledgement returned" };
    case "approve_payouts":
      return { source: "issuer", target: "bank", cash: false, label: "Payout instruction sent" };
    case "confirm_payouts":
      return { source: "bank", target: "holders", cash: true, label: "Bank confirmed customer payouts" };
    default: return null;
  }
}

function latestFor(events: WireEvent[], role: Role) {
  return [...events].reverse().find(event => event.actor === role || event.onBehalfOf === role);
}

export function Architecture({ snapshot: s, animatedEvent }: { snapshot: Snapshot; animatedEvent: WireEvent | null }) {
  const live = animatedEvent ? flowFor(animatedEvent.type) : null;
  const cashConfirmed = s.state.step >= 4;
  const payoutConfirmed = s.state.step >= 6;
  const waiting = s.presence.devices.filter(device => !device.role && device.connected);
  const activeCases = s.cases.filter(item => item.status !== "bank_acknowledged").length;

  function party(role: Party) {
    const position = role === "holders" ? null : s.roles.find(item => item.role === role);
    const device = role === "holders" ? null : s.presence.devices.find(item => item.role === role);
    const active = live?.source === role || live?.target === role;
    return <div key={role} className={`relative min-w-0 rounded-xl border bg-card p-4 transition-[border-color,box-shadow] duration-200 sm:p-5 ${active ? "border-primary shadow-md" : "border-border shadow-sm"}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary text-foreground">{role === "holders" ? <Users size={18} aria-hidden="true" /> : <Radio size={17} aria-hidden="true" />}</div>
        {role !== "holders" && <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${position?.connected ? "bg-emerald-100 text-emerald-950 dark:bg-emerald-900/40 dark:text-emerald-100" : "bg-muted text-muted-foreground"}`}>{position?.connected ? "Device online" : position?.claimed ? "Device offline" : "Role open"}</span>}
      </div>
      <h3 className="mt-3 text-sm font-bold leading-5">{names[role]}</h3>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{descriptions[role]}</p>
      {role !== "holders" && <p className="mt-3 truncate border-t border-border pt-3 font-mono text-[11px] text-muted-foreground">{device ? device.label : "No device assigned"}</p>}
    </div>;
  }

  function connector(source: Party, target: Party, label: string, confirmed = false) {
    const active = live?.source === source && live?.target === target;
    const cash = active ? live.cash : confirmed;
    return <div key={`${source}-${target}`} className="flex min-w-0 flex-col items-center justify-center gap-2 px-1" aria-label={label}>
      <span className="text-center text-[11px] font-semibold leading-4 text-muted-foreground">{label}</span>
      <div className={`flow-line relative w-full border-t-2 ${cash ? "border-primary" : "border-dashed border-muted-foreground"} ${active ? "flow-line-active" : ""}`}>
        <ArrowRight size={15} className={`absolute -right-1 -top-[9px] ${cash ? "text-primary" : "text-muted-foreground"}`} aria-hidden="true" />
      </div>
    </div>;
  }

  return <div className="space-y-5 p-4 sm:p-6" role="group" aria-label="Live issuer, fund, bank and holder workflow with device presence">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><p className="text-sm font-semibold">Who acts, and what moves</p><p className="mt-1 text-xs text-muted-foreground">Devices follow the role they claimed. No financial path enters the workflow ledger.</p></div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground"><span>┄ Instruction or evidence</span><span className="font-semibold text-primary">━━ Confirmed simulated cash</span></div>
    </div>
    {live && <div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm" role="status" aria-live="polite">
      <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"><ArrowRight size={15} aria-hidden="true" /></span>
      <span><strong>Accepted now:</strong> {names[live.source]} → {names[live.target]} · {live.label}</span>
    </div>}
    <div className="hidden grid-cols-[minmax(0,1fr)_minmax(65px,.36fr)_minmax(0,1fr)_minmax(65px,.36fr)_minmax(0,1fr)_minmax(65px,.36fr)_minmax(0,1fr)] gap-2 lg:grid">
      {party("issuer")}
      {connector("issuer", "fund", "request")}
      {party("fund")}
      {connector("fund", "bank", cashConfirmed ? `${formatMoney(s.state.balances.redemption)} confirmed` : "fund status", cashConfirmed)}
      {party("bank")}
      {connector("bank", "holders", payoutConfirmed ? "$450m paid" : "payout", payoutConfirmed)}
      {party("holders")}
    </div>
    <div className="space-y-2 lg:hidden">
      {(["issuer", "fund", "bank", "holders"] as Party[]).map((role, index) => <div key={role}>{party(role)}{index < 3 && <div className="flex h-8 items-center gap-3 pl-8 text-xs text-muted-foreground"><span className="h-5 border-l-2 border-dashed border-muted-foreground" /><ArrowDown size={14} aria-hidden="true" /><span>{role === "issuer" ? "Request to Fund" : role === "fund" ? "Fund status to Bank" : "Confirmed payout to holders"}</span></div>}</div>)}
    </div>
    <div className={`relative flex flex-wrap items-center justify-between gap-2 overflow-hidden rounded-lg border px-4 py-3 text-sm ${live?.target === "issuer" ? "border-primary bg-primary/5 workflow-return-active" : "border-border bg-muted/50"}`}>
      <span className="inline-flex items-center gap-2"><ArrowLeft size={16} aria-hidden="true" /> Fund acceptance and Bank acknowledgements return to Issuer</span>
      <span className="font-mono text-xs text-muted-foreground">{activeCases} practice {activeCases === 1 ? "case" : "cases"} unresolved</span>
    </div>
    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground"><span>{s.presence.admins} {s.presence.admins === 1 ? "admin" : "admins"} online</span><span>·</span><span>{waiting.length} choosing a role</span>{waiting.map(device => <span key={device.id} className="rounded-full bg-secondary px-2 py-1 font-mono">{device.label}</span>)}</div>
    {s.mode === "conventional" ? <div className="border-t border-border pt-5" data-testid="conventional-records">
      <div className="flex flex-wrap items-baseline justify-between gap-2"><h3 className="font-semibold">Separate records · reconciliation view</h3><span className="text-xs text-muted-foreground">Illustrative party projections, not separate databases</span></div>
      <div className="mt-3 grid gap-2 md:grid-cols-3">{(["issuer", "fund", "bank"] as const).map(role => {
        const last = latestFor(s.events, role);
        return <div key={role} className="min-w-0 rounded-lg border border-border bg-background p-3"><p className="text-xs font-semibold">{names[role]} record</p><p className="mt-2 line-clamp-2 min-h-10 text-xs leading-5 text-muted-foreground">{last?.label ?? "No accepted action yet."}</p><p className="mt-2 font-mono text-[11px] text-muted-foreground">{last ? `Event ${last.index}` : "Awaiting record"}</p></div>;
      })}</div>
      <p className="mt-3 inline-flex items-center gap-2 text-xs text-muted-foreground"><Clock3 size={14} aria-hidden="true" /> {activeCases} practice cases still need cross-team matching. No artificial delay is added.</p>
    </div> : <div className={`border-t border-border pt-5 ${live ? "workflow-ledger-pulse" : ""}`} data-testid="shared-ledger">
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="inline-flex items-center gap-2 font-semibold"><Link2 size={17} className="text-primary" aria-hidden="true" /> One shared workflow history</h3><span className="text-xs text-muted-foreground">Simulated SHA-256-linked events · not a deployed blockchain</span></div>
      <ol className="mt-3 grid gap-2 md:grid-cols-3">{s.events.slice(-3).reverse().map(event => <li key={event.id} className="min-w-0 rounded-lg border border-border bg-background p-3"><p className="truncate text-xs font-semibold">{event.label}</p><p className="mt-2 flex items-center gap-2 font-mono text-[11px] text-muted-foreground"><Check size={13} aria-hidden="true" /> #{event.index} · {event.hash.slice(0, 12)}…</p></li>)}{!s.events.length && <li className="text-sm text-muted-foreground">The first accepted action will appear here.</li>}</ol>
    </div>}
  </div>;
}
