"use client";

import { ArrowRight, GitCompareArrows, Link2 } from "lucide-react";
import { roleTitle } from "@/lib/ideas";
import type { Snapshot, WireEvent } from "@/lib/store";

function acceptedRoute(ideaKey: Snapshot["ideaKey"], event: WireEvent | null) {
  if (!event) return null;
  if (event.route) return event.route;
  if (ideaKey !== 1) return null;
  const routes: Record<string, { source: string; target: string; kind: "instruction" | "confirmed" }> = {
    request_redemption: { source: "issuer", target: "fund", kind: "instruction" },
    accept_redemption: { source: "fund", target: "issuer", kind: "instruction" },
    process_redemption: { source: "fund", target: "bank", kind: "instruction" },
    confirm_proceeds: { source: "fund", target: "bank", kind: "confirmed" },
    approve_payouts: { source: "issuer", target: "bank", kind: "instruction" },
    confirm_payouts: { source: "bank", target: "holders", kind: "confirmed" },
    case_opened: { source: "issuer", target: "fund", kind: "instruction" },
    case_fund_reviewed: { source: "fund", target: "bank", kind: "instruction" },
    case_bank_acknowledged: { source: "bank", target: "issuer", kind: "instruction" },
  };
  return routes[event.type] ?? null;
}

export function ComparisonWorkbench({ snapshot, selectedEventId, onSelect, animatedEvent }: {
  snapshot: Snapshot; selectedEventId: string | null; onSelect: (id: string) => void; animatedEvent: WireEvent | null;
}) {
  const events = snapshot.events;
  const selected = events.find(event => event.id === selectedEventId) ?? events.at(-1);
  const selectedRoute = acceptedRoute(snapshot.ideaKey, selected ?? null);
  const source = selectedRoute?.source ?? selected?.onBehalfOf ?? selected?.actor ?? "Sender desk";
  const target = selectedRoute?.target ?? "Counterparty desk";
  const sourceName = selected ? roleTitle(snapshot.ideaKey, source) : "Sender desk";
  const targetName = selected ? roleTitle(snapshot.ideaKey, target) : "Receiving desk";
  const reference = selected?.reference ?? (selected ? `Event #${selected.index}` : "SIM-PREVIEW-001");
  const preview = !selected;
  const liveRoute = acceptedRoute(snapshot.ideaKey, animatedEvent);
  return <section aria-label="Side-by-side workflow evidence comparison" className="min-w-0 rounded-xl border border-border bg-card p-3">
    <style>{`@keyframes accepted-route-flash { from { box-shadow: 0 0 0 4px var(--primary); } to { box-shadow: 0 0 0 0 transparent; } } .accepted-route-flash { animation: accepted-route-flash 800ms ease-out 1; } @media (prefers-reduced-motion: reduce) { .accepted-route-flash { animation: none !important; } }`}</style>
    <div className="flex flex-wrap items-center justify-between gap-2 px-1 pb-2">
      <div><h2 className="text-base font-bold sm:text-lg">What changes with a shared workflow record?</h2><p className="mt-1 text-xs text-muted-foreground">Same accepted action on both sides. Neither view moves assets or proves faster settlement.</p></div>
      <span className="rounded-full bg-secondary px-2.5 py-1 text-[11px] font-semibold">{preview ? "Fictional preview · no live action yet" : `Accepted event #${selected.index}`}</span>
    </div>
    <div className="hidden items-stretch gap-2 border-y border-border py-2 lg:flex" role="group" aria-label="Live role and device workflow">
      {snapshot.roles.map((role, index) => {
        const device = snapshot.presence.devices.find(item => item.role === role.role);
        const active = liveRoute?.source === role.role || liveRoute?.target === role.role;
        return <div key={role.role} className="contents"><div key={active ? `${role.role}-${animatedEvent?.id}` : role.role} className={`min-w-0 flex-1 rounded-md border px-2 py-1.5 ${active ? "accepted-route-flash border-primary bg-primary/5" : "border-border bg-background"}`}><p className="truncate text-xs font-semibold">{roleTitle(snapshot.ideaKey, role.role)}</p><p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">{device ? `${device.label} · ${device.connected ? "online" : "offline"}` : role.claimed ? "Device offline" : "Role open"}</p></div>{index < snapshot.roles.length - 1 && <span className="flex shrink-0 items-center text-muted-foreground" aria-hidden="true">┄→</span>}</div>;
      })}
    </div>
    {liveRoute && <p className="hidden border-b border-border py-1 text-xs font-semibold text-primary lg:block" role="status">Accepted now: {roleTitle(snapshot.ideaKey, liveRoute.source)} → {roleTitle(snapshot.ideaKey, liveRoute.target)} · {liveRoute.kind === "confirmed" ? "confirmed simulated movement" : "instruction or evidence"}</p>}
    {events.length > 0 && <div className="my-2 flex max-w-full gap-2 overflow-x-auto px-1 pb-1" aria-label="Select an accepted event to compare">{events.slice(-8).reverse().map(event => <button key={event.id} type="button" onClick={() => onSelect(event.id)} aria-pressed={selected?.id === event.id} className={`min-h-8 shrink-0 rounded-full border px-2.5 text-xs font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${selected?.id === event.id ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-muted"}`}>#{event.index} · {event.reference ?? event.type.replaceAll("_", " ")}</button>)}</div>}
    <div className="grid min-w-0 gap-3 lg:grid-cols-2">
      <article data-testid="conventional-records" className={`min-w-0 rounded-lg border p-3 transition-[border-color,box-shadow] ${snapshot.mode === "conventional" ? "border-primary ring-2 ring-primary/15" : "border-border"}`}>
        <h3 className="flex items-center gap-2 text-sm font-bold"><GitCompareArrows size={17} className="text-primary" aria-hidden="true" /> Without blockchain · separate records</h3>
        {!preview && <p className="mt-1 font-mono text-[11px] text-primary">Selected evidence · Event #{selected.index}</p>}
        <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">Each party keeps a simulated record; counterpart status and reference require reconciliation.</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2"><div className="rounded-md border border-border bg-background p-2"><p className="truncate text-[11px] font-semibold text-muted-foreground">{sourceName} record</p><p className="mt-1 line-clamp-1 text-xs font-medium">{preview ? "Illustrative outgoing instruction" : selected.label}</p><p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">{reference}</p></div><div className="rounded-md border border-border bg-background p-2"><p className="truncate text-[11px] font-semibold text-muted-foreground">{targetName} record</p><p className="mt-1 line-clamp-1 text-xs font-medium">{preview ? "Illustrative receipt to match" : selected.label}</p><p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">{reference}</p></div></div>
        <p className="mt-2 flex items-center gap-2 text-xs font-semibold text-amber-800 dark:text-amber-200"><ArrowRight size={14} aria-hidden="true" /> Reconcile status; an instruction is not confirmation.</p>
      </article>
      <article data-testid="shared-ledger" className={`min-w-0 rounded-lg border p-3 transition-[border-color,box-shadow] ${snapshot.mode === "ledger" ? "border-primary ring-2 ring-primary/15" : "border-border"}`}>
        <h3 className="flex items-center gap-2 text-sm font-bold"><Link2 size={17} className="text-primary" aria-hidden="true" /> With blockchain · shared history simulation</h3>
        <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">Both desks see the same accepted event in a simulated SHA-256-linked history.</p>
        <div className="mt-2 rounded-md border border-border bg-background p-2"><p className="truncate text-[11px] font-semibold text-muted-foreground">{preview ? "Fictional linked-entry preview" : `Shared event #${selected.index} · ${sourceName} → ${targetName}`}</p><p className="mt-1 line-clamp-1 text-xs font-medium">{preview ? "An accepted click will be recorded here for both parties." : selected.label}</p><p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">{preview ? "Hash appears after a server-accepted action" : `${selected.hash.slice(0, 24)}… · previous ${selected.previousHash.slice(0, 12)}…`}</p></div>
        <p className="mt-2 text-xs font-semibold text-foreground">Shared action evidence, not proof of settlement.</p>
      </article>
    </div>
  </section>;
}
