"use client";

import { useMemo, useState } from "react";
import { Activity, ArrowRight, CheckCircle2, Clock3, FileText, Inbox, Search, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import type { DeskView, IdeaRole, IdeaSpec } from "@/lib/ideas/types";
import { practiceTemplates } from "@/lib/practice-catalog";

type EventItem = { id: string; label: string; actor: string; createdAt: string; reference: string | null };
type PracticeItem = { itemKey: string; ownerRole: string; counterpartyRole: string; title: string; detail: string; status: string };
type Selection = { kind: "sample" | "practice" | "event"; key: string } | null;

export type ScenarioWorkspaceProps = {
  spec: IdeaSpec;
  role: string;
  view: DeskView;
  state: Record<string, unknown>;
  events: EventItem[];
  practiceItems: PracticeItem[];
  disabled: boolean;
  onAction: (actionId: string) => void;
  onPractice: (itemKey: string, action: string) => void;
  onCreatePractice: (templateId: string) => Promise<void>;
};

const PRACTICE_LABEL: Record<string, string> = {
  acknowledge: "Acknowledge",
  request_clarification: "Request clarification",
  respond: "Send response",
  flag: "Flag for review",
  resolve: "Resolve item",
};

function friendly(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, letter => letter.toUpperCase());
}

function eventTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Recorded in this run" : date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function practiceActions(item: PracticeItem, role: string): string[] {
  if (item.status === "resolved") return [];
  if (role === item.counterpartyRole) return item.status === "clarification_requested" ? ["respond"] : [];
  if (role !== item.ownerRole) return [];
  if (item.status === "pending") return ["acknowledge", "request_clarification", "flag"];
  if (item.status === "acknowledged") return ["request_clarification", "flag", "resolve"];
  if (item.status === "responded" || item.status === "flagged") return ["resolve"];
  return [];
}

function RoleHeader({ spec, desk }: { spec: IdeaSpec; desk: IdeaRole }) {
  const Icon = spec.id === 2 ? Inbox : spec.id === 3 ? Activity : ShieldCheck;
  return <header className="min-w-0 border-b border-border pb-6">
    <div className="flex flex-col items-start gap-4 sm:flex-row">
      <span className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-border bg-secondary text-foreground"><Icon size={23} aria-hidden="true" /></span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-primary">Idea {spec.id} · {spec.title}</p>
        <h1 className="mt-1 break-words text-2xl font-semibold leading-tight text-balance sm:text-3xl">{desk.title}</h1>
        <p className="mt-2 text-sm font-medium text-foreground">{desk.organization}</p>
        <p className="mt-2 max-w-2xl text-base leading-6 text-muted-foreground">{desk.responsibility}</p>
      </div>
    </div>
  </header>;
}

function MainAction({ spec, role, state, disabled, onAction, compact = false }: Pick<ScenarioWorkspaceProps, "spec" | "role" | "state" | "disabled" | "onAction"> & { compact?: boolean }) {
  const next = spec.actions(state)[0];
  const mine = next?.role === role;
  const nextRole = spec.roles.find(item => item.id === next?.role)?.title ?? "another desk";
  const complete = !next;
  const message = complete ? "The guided case is complete. Review the accepted actions in Activity." : mine ? next.detail : `Waiting for ${nextRole} to complete the next guided step.`;
  return <section aria-label="Main guided scenario action" className={`rounded-xl border border-primary/30 bg-primary/5 ${compact ? "p-4" : "p-5 sm:p-6"}`}>
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-sm font-semibold text-primary">{complete ? <CheckCircle2 size={17} aria-hidden="true" /> : mine ? <ArrowRight size={17} aria-hidden="true" /> : <Clock3 size={17} aria-hidden="true" />}{complete ? "Guided case complete" : mine ? "Pitch action · your turn" : "Guided case · waiting"}</p>
        <h2 className={`${compact ? "mt-2 text-lg" : "mt-3 text-xl sm:text-2xl"} font-semibold text-balance`}>{complete ? "All desks have acted" : mine ? next.label : `${nextRole} acts next`}</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-foreground sm:text-base">{message}</p>
      </div>
      {mine && next && <Button type="button" onClick={() => onAction(next.id)} disabled={disabled} className="w-full shrink-0 sm:w-auto">{next.label}<ArrowRight size={17} aria-hidden="true" /></Button>}
    </div>
  </section>;
}

function Overview({ spec, desk, role, state, events, practiceItems, disabled, onAction, select }: ScenarioWorkspaceProps & { desk: IdeaRole; select: (selection: Selection) => void }) {
  const mine = practiceItems.filter(item => item.ownerRole === role || item.counterpartyRole === role);
  const needsAttention = mine.filter(item => practiceActions(item, role).length > 0).length;
  const recent = events.slice(-4).reverse();
  return <div className="space-y-7">
    <MainAction spec={spec} role={role} state={state} disabled={disabled} onAction={onAction} />
    <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(260px,.7fr)]">
      <section className="min-w-0" aria-label="Desk summary">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-xl font-semibold">{desk.workTitle}</h2><p className="mt-1 text-sm text-muted-foreground">Your case and work queue at a glance.</p></div><span className="rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold text-foreground">Practice · no asset movement</span></div>
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <dl className="grid gap-x-6 gap-y-3 border-b border-border p-5 sm:grid-cols-2"><div><dt className="text-sm text-muted-foreground">{desk.metricLabel}</dt><dd className="mt-1 text-xl font-semibold tabular-nums">{desk.metricValue}</dd></div><div><dt className="text-sm text-muted-foreground">Work items requiring you</dt><dd className="mt-1 text-xl font-semibold tabular-nums">{needsAttention}</dd></div></dl>
          <div className="p-5"><h3 className="font-semibold">Current work</h3>{mine.length ? <ul className="mt-3 divide-y divide-border">{mine.slice(0, 3).map(item => <li key={item.itemKey}><button type="button" onClick={() => select({ kind: "practice", key: item.itemKey })} className="flex min-h-14 w-full items-center justify-between gap-3 py-2 text-left hover:text-primary focus-visible:rounded-md focus-visible:outline-2 focus-visible:outline-ring"><span className="min-w-0"><span className="block truncate font-medium">{item.title}</span><span className="block text-sm text-muted-foreground">{friendly(item.status)}</span></span><ArrowRight className="shrink-0" size={16} aria-hidden="true" /></button></li>)}</ul> : <p className="mt-2 text-sm leading-6 text-muted-foreground">No shared practice items yet. The guided case remains available above.</p>}</div>
        </div>
      </section>
      <aside className="min-w-0 space-y-5">
        <section aria-label="Recent accepted activity" className="rounded-xl border border-border bg-card p-5"><h2 className="font-semibold">Recent accepted activity</h2><p className="mt-1 text-sm text-muted-foreground">Live actions in this run, not sample records.</p>{recent.length ? <ol className="mt-4 divide-y divide-border">{recent.map(event => <li key={event.id}><button type="button" onClick={() => select({ kind: "event", key: event.id })} className="min-h-14 w-full py-3 text-left hover:text-primary focus-visible:rounded-md focus-visible:outline-2 focus-visible:outline-ring"><span className="block text-sm font-semibold">{event.label}</span><span className="mt-1 block text-xs text-muted-foreground">{eventTime(event.createdAt)} · {friendly(event.actor)}</span></button></li>)}</ol> : <p className="mt-4 text-sm leading-6 text-muted-foreground">No accepted actions yet. The presenter will see each action as it happens.</p>}</section>
        <p className="text-sm leading-6 text-muted-foreground">Fictional demonstration. These screens do not connect to a bank, broker, tax authority, or blockchain.</p>
      </aside>
    </div>
  </div>;
}

function Work({ spec, desk, role, state, practiceItems, disabled, onAction, onCreatePractice, select }: ScenarioWorkspaceProps & { desk: IdeaRole; select: (selection: Selection) => void }) {
  const [query, setQuery] = useState("");
  const term = query.trim().toLowerCase();
  const mine = practiceItems.filter(item => (item.ownerRole === role || item.counterpartyRole === role) && `${item.itemKey} ${item.title} ${item.detail} ${item.status}`.toLowerCase().includes(term));
  const samples = desk.sampleRecords.filter(item => `${item.reference} ${item.title} ${item.detail} ${item.status}`.toLowerCase().includes(term));
  const templates = practiceTemplates(spec.id, role);
  const createdCount = practiceItems.filter(item => item.itemKey.startsWith("LIVE-")).length;
  return <div className="space-y-7">
    <MainAction spec={spec} role={role} state={state} disabled={disabled} onAction={onAction} compact />
    <section aria-label="Start practice task" className="rounded-xl border border-border bg-card p-4 sm:p-5"><div className="flex flex-wrap items-baseline justify-between gap-2"><h2 className="font-semibold">Start practice task</h2><span className="font-mono text-xs text-muted-foreground">{createdCount}/20 new tasks this run</span></div><p className="mt-1 text-sm text-muted-foreground">Send a job-specific request to another desk. It is live and replayable, but cannot change the guided outcome.</p><div className="mt-4 flex flex-wrap gap-2">{templates.map(template => <Button key={template.id} variant="secondary" className="max-w-full min-w-0 flex-wrap break-words text-left" disabled={disabled || createdCount >= 20} onClick={() => void onCreatePractice(template.id)}>{disabled ? "Waiting for connection…" : template.title} <ArrowRight size={15} className="shrink-0" aria-hidden="true" /></Button>)}</div></section>
    <section aria-label={desk.workTitle} className="min-w-0"><div className="flex flex-wrap items-end justify-between gap-4"><div><h2 className="text-xl font-semibold">{desk.workTitle}</h2><p className="mt-1 text-sm text-muted-foreground">Accepted practice work and separate fictional reference records.</p></div><label className="relative block w-full sm:w-72"><span className="sr-only">Search work records</span><Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" /><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search references or status" className="min-h-11 w-full rounded-md border border-border bg-card pl-10 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" /></label></div>
      <div className="mt-6 grid min-w-0 gap-7 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="min-w-0"><div className="mb-3 flex items-baseline justify-between gap-3"><h3 className="font-semibold">Shared practice work</h3><span className="font-mono text-xs text-muted-foreground">{mine.length} shown</span></div>{mine.length ? <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">{mine.map(item => <li key={item.itemKey}><button type="button" onClick={() => select({ kind: "practice", key: item.itemKey })} className="flex min-h-20 w-full items-center justify-between gap-3 p-4 text-left hover:bg-muted focus-visible:bg-muted focus-visible:outline-2 focus-visible:outline-ring"><span className="min-w-0"><span className="block font-semibold">{item.title}</span><span className="mt-1 block text-sm text-muted-foreground">{friendly(item.status)} · {item.itemKey}</span></span><ArrowRight size={18} className="shrink-0" aria-hidden="true" /></button></li>)}</ul> : <div className="rounded-xl border border-border bg-card p-5 text-sm leading-6 text-muted-foreground">{term ? "No shared work matches your search." : "No shared practice items for this desk yet."}</div>}</div>
        <div className="min-w-0"><div className="mb-3 flex items-baseline justify-between gap-3"><h3 className="font-semibold">Sample records</h3><span className="text-xs font-medium text-muted-foreground">Fictional · not live</span></div>{samples.length ? <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">{samples.map(item => <li key={item.reference}><button type="button" onClick={() => select({ kind: "sample", key: item.reference })} className="flex min-h-20 w-full items-center justify-between gap-3 p-4 text-left hover:bg-muted focus-visible:bg-muted focus-visible:outline-2 focus-visible:outline-ring"><span className="min-w-0"><span className="block font-semibold">{item.title}</span><span className="mt-1 block text-sm text-muted-foreground">{item.status} · <span className="font-mono">{item.reference}</span></span></span><FileText size={18} className="shrink-0" aria-hidden="true" /></button></li>)}</ul> : <div className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">No sample records match your search.</div>}</div>
      </div>
    </section>
  </div>;
}

function ActivityView({ spec, role, state, events, disabled, onAction, desk, select }: ScenarioWorkspaceProps & { desk: IdeaRole; select: (selection: Selection) => void }) {
  const newest = [...events].reverse();
  return <div className="space-y-7"><MainAction spec={spec} role={role} state={state} disabled={disabled} onAction={onAction} compact /><div className="grid min-w-0 gap-7 lg:grid-cols-[minmax(0,1.4fr)_minmax(260px,.7fr)]"><section className="min-w-0" aria-label="Live accepted activity"><h2 className="text-xl font-semibold">Live accepted activity</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">These are recorded actions in this run. Select an event for its actor and reference.</p>{newest.length ? <ol className="mt-5 divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">{newest.map(event => <li key={event.id}><button type="button" onClick={() => select({ kind: "event", key: event.id })} className="flex min-h-20 w-full gap-4 p-4 text-left hover:bg-muted focus-visible:bg-muted focus-visible:outline-2 focus-visible:outline-ring"><span className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary"><CheckCircle2 size={17} aria-hidden="true" /></span><span className="min-w-0"><span className="block font-semibold">{event.label}</span><span className="mt-1 block text-sm text-muted-foreground">{eventTime(event.createdAt)} · {friendly(event.actor)}</span><span className="mt-1 block break-all font-mono text-xs text-muted-foreground">{event.reference ?? "Workflow event"}</span></span></button></li>)}</ol> : <div className="mt-5 rounded-xl border border-border bg-card p-6"><p className="font-semibold">No accepted activity yet</p><p className="mt-2 text-sm leading-6 text-muted-foreground">The first guided or practice action will appear here and on the presenter workflow.</p></div>}</section><aside className="min-w-0"><section aria-label="Sample activity" className="rounded-xl border border-border bg-card p-5"><h2 className="font-semibold">Sample activity</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">Static fictional desk context. These rows do not create events or animate the workflow.</p><ul className="mt-4 divide-y divide-border">{desk.sampleRecords.slice(1, 5).map(item => <li key={item.reference} className="py-3"><p className="text-sm font-semibold">{item.title}</p><p className="mt-1 text-xs text-muted-foreground"><span className="font-mono">{item.reference}</span> · {item.status}</p></li>)}</ul></section><p className="mt-4 text-sm leading-6 text-muted-foreground">The shared workflow record is a simulated hash-linked history, not a live blockchain or a financial ledger.</p></aside></div></div>;
}

export function ScenarioWorkspace(props: ScenarioWorkspaceProps) {
  const { spec, role, view, events, practiceItems, disabled, onPractice, onCreatePractice } = props;
  const [selection, setSelection] = useState<Selection>(null);
  const desk = spec.roles.find(item => item.id === role);
  const selectedItem = selection?.kind === "practice" ? practiceItems.find(item => item.itemKey === selection.key) : null;
  const selectedSample = selection?.kind === "sample" ? desk?.sampleRecords.find(item => item.reference === selection.key) : null;
  const selectedEvent = selection?.kind === "event" ? events.find(item => item.id === selection.key) : null;
  const selectedActions = useMemo(() => selectedItem ? practiceActions(selectedItem, role) : [], [selectedItem, role]);
  const sampleTemplateIndex = selectedSample ? desk?.sampleRecords.findIndex(item => item.reference === selectedSample.reference) : -1;
  const sampleTemplate = (sampleTemplateIndex === 1 || sampleTemplateIndex === 2) ? practiceTemplates(spec.id, role)[sampleTemplateIndex - 1] : null;
  const createdCount = practiceItems.filter(item => item.itemKey.startsWith("LIVE-")).length;
  if (!desk) return <section role="status" className="rounded-xl border border-border bg-card p-6"><h1 className="text-xl font-semibold">Role unavailable</h1><p className="mt-2 text-sm text-muted-foreground">Choose an available role for this idea to open its workspace.</p></section>;
  return <div className="min-w-0 space-y-7 pb-24 sm:pb-8"><RoleHeader spec={spec} desk={desk} />
    {view === "overview" ? <Overview {...props} desk={desk} select={setSelection} /> : view === "work" ? <Work {...props} desk={desk} select={setSelection} /> : <ActivityView {...props} desk={desk} select={setSelection} />}
    <Sheet open={Boolean(selectedItem || selectedSample || selectedEvent)} onOpenChange={open => { if (!open) setSelection(null); }} title={selectedItem?.title ?? selectedSample?.title ?? selectedEvent?.label ?? "Details"}>
      {selectedItem && <div className="space-y-5"><p className="font-mono text-sm text-muted-foreground">{selectedItem.itemKey}</p><p className="text-base leading-7">{selectedItem.detail}</p><dl className="space-y-3 border-y border-border py-4 text-sm"><div className="flex justify-between gap-4"><dt>Status</dt><dd className="font-semibold">{friendly(selectedItem.status)}</dd></div><div className="flex justify-between gap-4"><dt>Owner</dt><dd className="text-right">{spec.roles.find(item => item.id === selectedItem.ownerRole)?.title ?? friendly(selectedItem.ownerRole)}</dd></div><div className="flex justify-between gap-4"><dt>Counterparty</dt><dd className="text-right">{spec.roles.find(item => item.id === selectedItem.counterpartyRole)?.title ?? friendly(selectedItem.counterpartyRole)}</dd></div></dl><p className="text-sm leading-6 text-muted-foreground">Practice coordination only. This item does not move cash, securities, or tax relief.</p>{selectedActions.length > 0 && <div className="flex flex-wrap gap-2">{selectedActions.map(action => <Button key={action} type="button" variant={action === "acknowledge" || action === "respond" || action === "resolve" ? "primary" : "secondary"} disabled={disabled} onClick={() => { onPractice(selectedItem.itemKey, action); setSelection(null); }}>{PRACTICE_LABEL[action]}</Button>)}</div>}</div>}
      {selectedSample && <div className="space-y-5"><p className="font-mono text-sm text-muted-foreground">{selectedSample.reference}</p><p className="text-base leading-7">{selectedSample.detail}</p><p className="rounded-lg bg-secondary p-4 text-sm"><strong>Status:</strong> {selectedSample.status}</p><p className="text-sm leading-6 text-muted-foreground">Sample record only. It does not represent an accepted action in this run and does not appear in the shared workflow log.</p>{sampleTemplate && <Button className="w-full" disabled={disabled || createdCount >= 20} onClick={() => { void onCreatePractice(sampleTemplate.id); setSelection(null); }}>Start related practice task <ArrowRight size={16} aria-hidden="true" /></Button>}</div>}
      {selectedEvent && <div className="space-y-5"><p className="text-base leading-7">{selectedEvent.label}</p><dl className="space-y-3 border-y border-border py-4 text-sm"><div className="flex justify-between gap-4"><dt>Recorded</dt><dd className="text-right">{eventTime(selectedEvent.createdAt)}</dd></div><div className="flex justify-between gap-4"><dt>Actor</dt><dd className="text-right font-semibold">{spec.roles.find(item => item.id === selectedEvent.actor)?.title ?? friendly(selectedEvent.actor)}</dd></div><div className="flex justify-between gap-4"><dt>Reference</dt><dd className="break-all text-right font-mono">{selectedEvent.reference ?? "—"}</dd></div></dl><p className="text-sm leading-6 text-muted-foreground">Accepted simulated workflow event. No real system was contacted.</p></div>}
    </Sheet>
  </div>;
}
