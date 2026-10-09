"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import * as Switch from "@radix-ui/react-switch";
import { ArrowRight, Copy, ExternalLink, MoreHorizontal, Pause, Play, QrCode, RotateCcw, Wifi, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { Disclaimer, ThemeToggle } from "@/components/common";
import { ScenarioArchitecture } from "@/components/ideas/scenario-architecture";
import { ComparisonWorkbench } from "@/components/comparison-workbench";
import { getIdeaSpec, IDEA_TITLES, roleTitle } from "@/lib/ideas";
import type { IdeaKey } from "@/lib/ideas/types";
import type { Snapshot, WireEvent, PracticeStatus } from "@/lib/store";
import type { useRoom } from "@/hooks/use-room";

type Props = {
  code: string;
  snapshot: Snapshot;
  connected: boolean;
  busy: boolean;
  error: string | null;
  animatedEvent: WireEvent | null;
  post: ReturnType<typeof useRoom>["post"];
};
type PracticeAction = "acknowledge" | "request_clarification" | "respond" | "flag" | "resolve";
type PracticeItem = Snapshot["practiceItems"][number];

function practiceOptions(item: PracticeItem): { action: PracticeAction; role: string; label: string }[] {
  const options: { action: PracticeAction; role: string; label: string }[] = [];
  if (item.status === "pending") options.push({ action: "acknowledge", role: item.ownerRole, label: "Acknowledge" });
  if (item.status === "pending" || item.status === "acknowledged") options.push({ action: "request_clarification", role: item.ownerRole, label: "Request details" });
  if (item.status === "clarification_requested") options.push({ action: "respond", role: item.counterpartyRole, label: "Respond" });
  if (item.status !== "resolved") options.push({ action: "flag", role: item.ownerRole, label: "Flag" });
  if (["acknowledged", "responded", "flagged"].includes(item.status)) options.push({ action: "resolve", role: item.ownerRole, label: "Resolve" });
  return options;
}

const statusLabel: Record<PracticeStatus, string> = {
  pending: "Pending review", acknowledged: "Acknowledged", clarification_requested: "Details requested",
  responded: "Response received", flagged: "Flagged", resolved: "Resolved",
};

export function ScenarioPresenter({ code, snapshot: s, connected, busy, error, animatedEvent, post }: Props) {
  const [showQr, setShowQr] = useState(false);
  const [showIdeas, setShowIdeas] = useState(false);
  const [selected, setSelected] = useState<WireEvent | null>(null);
  const [comparisonId, setComparisonId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [localJoinUrl, setLocalJoinUrl] = useState("");
  const [sampleOffset, setSampleOffset] = useState(0);
  const spec = getIdeaSpec(s.ideaKey);
  useEffect(() => { if (selected) queueMicrotask(() => setComparisonId(selected.id)); }, [selected]);
  useEffect(() => { queueMicrotask(() => setLocalJoinUrl(`${location.origin}/join/${code}`)); }, [code]);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") setSampleOffset(index => index + 1); }, 12_000);
    return () => window.clearInterval(timer);
  }, []);
  if (!spec) return null;

  const disabled = !connected || busy;
  const joinUrl = s.joinUrl || localJoinUrl;
  const nextIdea = (s.ideaKey === 4 ? 1 : s.ideaKey + 1) as IdeaKey;
  const canAdvance = s.status === "ended" || (s.status === "active" && s.ideaActions.length === 0);
  const samples = spec.roles.flatMap(role => role.sampleRecords.map(item => ({ ...item, desk: role.title })));
  const displayedSamples = samples.length ? [0, 1, 2].map(index => samples[(sampleOffset * 3 + index) % samples.length]) : [];

  async function control(name: string, extra: object = {}) {
    try { await post("controls", { control: name, ...extra }); setNotice(`${name.replaceAll("_", " ")} accepted.`); }
    catch { /* useRoom displays the server error */ }
  }
  async function switchIdea(ideaKey: IdeaKey) {
    setShowIdeas(false);
    setSelected(null);
    if (ideaKey === s.ideaKey) return;
    await control("switch_idea", { ideaKey });
  }
  async function takeOver(actionId: string, role: string) {
    try {
      const result = await post<{ message?: string }>("idea-actions", { actionId, ...(role === "presenter" ? {} : { onBehalfOf: role }) });
      setNotice(result.message ?? "Action accepted.");
    } catch { /* useRoom displays the server error */ }
  }
  async function practice(itemKey: string, action: PracticeAction, role: string) {
    try {
      const result = await post<{ message?: string }>("practice", { itemKey, action, onBehalfOf: role });
      setNotice(result.message ?? "Practice action accepted.");
    } catch { /* useRoom displays the server error */ }
  }
  async function kick(id: string) {
    try { await post("sessions/kick", { sessionId: id }); setNotice("Device removed. It can rejoin with the same QR link."); }
    catch { /* useRoom displays the server error */ }
  }
  async function copyJoin() {
    try { await navigator.clipboard.writeText(joinUrl); setNotice("Join link copied."); }
    catch { setNotice("Copy failed. Use the visible join link."); }
  }

  return <div className="flex min-h-screen flex-col bg-background text-foreground">
    <a href="#scenario-presenter-main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-background focus:p-3">Skip to main content</a>
    <header className="border-b border-border bg-card"><div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-8">
      <div className="flex items-center gap-4"><div className="text-sm font-bold tracking-tight">RESERVE <span className="text-primary">OPERATIONS</span> LAB</div><span className="hidden font-mono text-xs text-muted-foreground sm:inline">{s.code} · IDEA {s.ideaKey} · RUN {s.runNumber}</span></div>
      <div className="flex items-center gap-3"><span className={`inline-flex items-center gap-1 text-xs ${connected ? "text-foreground" : "text-destructive"}`}>{connected ? <Wifi size={15} aria-hidden="true" /> : <WifiOff size={15} aria-hidden="true" />}{connected ? "Connected" : "Offline"}</span><ThemeToggle /></div>
    </div></header>
    <main id="scenario-presenter-main" className="mx-auto w-full max-w-[1440px] flex-1 space-y-3 px-4 py-3 sm:px-8">
      <div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0"><p className="text-sm font-semibold text-primary">Idea {s.ideaKey} of 4 · {s.status}</p><h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">{spec.title}</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">Guide the desks through the pitch. Participant actions appear live; fictional samples stay separate.</p></div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto"><Button variant="secondary" onClick={() => setShowQr(value => !value)} aria-expanded={showQr} aria-controls="scenario-qr"><QrCode size={16} aria-hidden="true" />{showQr ? "Hide QR" : "Show QR"}</Button><Button variant="ghost" aria-label="Open idea menu" onClick={() => setShowIdeas(true)}><MoreHorizontal size={20} aria-hidden="true" /></Button></div>
      </div>
      {error && <p role="alert" className="rounded-lg border border-destructive p-3 text-sm text-destructive">{error}{!connected && " Actions are disabled until the connection returns."}</p>}
      {notice && <p role="status" className="rounded-lg bg-secondary p-3 text-sm text-foreground">{notice}</p>}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 sm:px-5"><div className="flex flex-wrap items-center gap-3 text-sm font-semibold"><span className={s.mode === "conventional" ? "text-foreground" : "text-muted-foreground"}>Without blockchain</span><Switch.Root checked={s.mode === "ledger"} onCheckedChange={checked => void control("set_mode", { mode: checked ? "ledger" : "conventional" })} disabled={disabled} aria-label="Show shared workflow ledger" className="relative h-7 w-12 rounded-full bg-secondary data-[state=checked]:bg-primary"><Switch.Thumb className="block h-5 w-5 translate-x-1 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-6" /></Switch.Root><span className={s.mode === "ledger" ? "text-foreground" : "text-muted-foreground"}>With blockchain</span></div><p className="text-xs text-muted-foreground">Same accepted events; separate records or one simulated shared history.</p></div>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3"><div className="flex flex-wrap items-center gap-2"><span className="text-xs font-semibold text-muted-foreground">Run controls</span>{s.status === "lobby" ? <Button size="sm" onClick={() => void control("start")} disabled={disabled}><Play size={15} aria-hidden="true" />Start</Button> : s.status === "paused" ? <Button size="sm" onClick={() => void control("resume")} disabled={disabled}><Play size={15} aria-hidden="true" />Resume</Button> : s.status === "active" ? <Button size="sm" variant="secondary" onClick={() => void control("pause")} disabled={disabled}><Pause size={15} aria-hidden="true" />Pause</Button> : null}<Button size="sm" variant="secondary" onClick={() => void control("reset")} disabled={disabled}><RotateCcw size={15} aria-hidden="true" />Reset this idea</Button><Button size="sm" variant="danger" onClick={() => void control("end")} disabled={disabled || s.status === "ended"}>End run</Button></div>{canAdvance && <Button size="sm" onClick={() => void switchIdea(nextIdea)} disabled={disabled}>Next idea <ArrowRight size={15} aria-hidden="true" /></Button>}</div>
      <ComparisonWorkbench snapshot={s} selectedEventId={comparisonId} onSelect={setComparisonId} animatedEvent={animatedEvent} />
      <div className={showQr ? "grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(270px,.32fr)]" : ""}>
        <section className="min-w-0 overflow-hidden rounded-xl border border-border bg-card" aria-label="Live workflow diagram"><ScenarioArchitecture spec={spec} state={s.ideaState} roles={s.roles.map(role => ({ role: role.role, claimed: role.claimed, connected: role.connected }))} devices={s.presence.devices} animatedEvent={animatedEvent} events={s.events} /></section>
        {showQr && <section id="scenario-qr" className="rounded-xl border border-border bg-card p-5" aria-label="Join this demo"><h2 className="text-lg font-semibold">Join this room</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">Scan once. The same link follows each idea and works from another Chrome profile or device.</p><div className="mt-5 rounded-lg border border-border bg-white p-3 text-black max-w-max"><QRCodeSVG value={joinUrl} size={188} marginSize={2} bgColor="#ffffff" fgColor="#111111" aria-label="QR code to join this demo room" /></div><p className="mt-4 break-all font-mono text-xs leading-5 text-muted-foreground">{joinUrl}</p><Button variant="secondary" className="mt-3 w-full" onClick={() => void copyJoin()} disabled={!joinUrl}><Copy size={16} aria-hidden="true" />Copy join link</Button></section>}
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,.8fr)]"><section className="rounded-xl border border-border bg-card p-5 sm:p-6" aria-label="Guided pitch actions"><div className="flex flex-wrap items-baseline justify-between gap-2"><h2 className="text-lg font-semibold">Guide the next action</h2><span className="font-mono text-xs text-muted-foreground">{s.ideaActions.length} ready</span></div><p className="mt-2 text-sm leading-6 text-muted-foreground">Ask the named person to press the highlighted action on their device. Use takeover only if that desk has no participant.</p><div className="mt-5 space-y-3 border-t border-border pt-4">{s.ideaActions.length ? s.ideaActions.map((action, index) => <div key={action.id} className={`rounded-lg border p-4 ${index === 0 ? "border-primary/50 bg-primary/5" : "border-border"}`}><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-xs font-semibold text-primary">{roleTitle(s.ideaKey, action.role)} · {index === 0 ? "suggested next" : "available"}</p><h3 className="mt-1 text-base font-semibold">{action.label}</h3><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{action.detail}</p></div><span className="rounded-full bg-secondary px-2 py-1 font-mono text-xs">{action.pathKind}</span></div><Button size="sm" className="mt-4" onClick={() => void takeOver(action.id, action.role)} disabled={disabled || s.status !== "active"}>{action.role === "presenter" ? "Perform presenter step" : `Act for ${roleTitle(s.ideaKey, action.role)}`} <ArrowRight size={15} aria-hidden="true" /></Button></div>) : <p className="py-5 text-sm text-muted-foreground">{s.status === "lobby" ? "Start the run to begin the walkthrough." : "No further guided action is ready. Review the history or move to the next idea."}</p>}</div></section>
        <section className="rounded-xl border border-border bg-card p-5 sm:p-6" aria-label="Device roster"><div className="flex flex-wrap items-end justify-between gap-2"><div><h2 className="text-lg font-semibold">Devices in the room</h2><p className="mt-1 text-sm text-muted-foreground">Live presence · role claims are idea-specific</p></div><strong className="font-mono text-2xl">{s.presence.online} <span className="text-sm font-normal text-muted-foreground">online</span></strong></div><p className="mt-3 text-xs text-muted-foreground">{s.presence.admins} admins · {s.presence.waiting} choosing · {s.presence.assigned} assigned</p><div className="mt-4 max-h-[430px] overflow-y-auto border-t border-border">{s.presence.devices.length ? s.presence.devices.map(device => <div key={device.id} className="flex min-w-0 items-center justify-between gap-3 border-b border-border py-3 text-sm"><div className="min-w-0"><span className="block truncate font-mono font-semibold">{device.label}</span><span className="text-xs text-muted-foreground">{device.role ? roleTitle(s.ideaKey, device.role) : "Choosing a role"} · {device.connected ? "Online" : "Offline"}</span></div><Button variant="ghost" size="sm" onClick={() => void kick(device.id)} disabled={disabled} aria-label={`Kick ${device.label}`}>Kick</Button></div>) : <p className="py-5 text-sm text-muted-foreground">No participant devices yet. Show the QR to invite them.</p>}</div></section></div>
      <div className="grid gap-5 lg:grid-cols-2"><section className="rounded-xl border border-border bg-card p-5 sm:p-6" aria-label="Practice tasks"><h2 className="text-lg font-semibold">Supporting work</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">Shared practice records. These clicks are replayable but cannot change the main scenario outcome.</p><div className="mt-4 max-h-[470px] overflow-y-auto border-t border-border">{s.practiceItems.length ? s.practiceItems.map(item => <div key={item.itemKey} className="border-b border-border py-4"><div className="flex flex-wrap items-baseline justify-between gap-2"><p className="font-mono text-xs font-semibold">{item.itemKey}</p><span className="text-xs font-semibold text-muted-foreground">{statusLabel[item.status]}</span></div><p className="mt-1 text-sm font-semibold">{item.title}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{item.detail} · {roleTitle(s.ideaKey, item.ownerRole)} ↔ {roleTitle(s.ideaKey, item.counterpartyRole)}</p><div className="mt-3 flex flex-wrap gap-2">{practiceOptions(item).map(option => <Button key={`${option.role}-${option.action}`} variant="secondary" size="sm" disabled={disabled || s.status !== "active"} onClick={() => void practice(item.itemKey, option.action, option.role)} aria-label={`${option.label} ${item.title} as ${roleTitle(s.ideaKey, option.role)}`}>{option.label}</Button>)}</div></div>) : <p className="py-5 text-sm text-muted-foreground">No supporting records in this run.</p>}</div></section>
        <section className="rounded-xl border border-border bg-card p-5 sm:p-6" aria-label="Accepted activity"><div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-lg font-semibold">Accepted live activity</h2><p className="mt-1 text-xs text-muted-foreground">Only server-accepted clicks appear here.</p></div><Link href={`/results/${code}`} className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-primary">Full replay <ExternalLink size={15} aria-hidden="true" /></Link></div><div className="mt-4 max-h-[470px] overflow-y-auto border-t border-border">{s.events.length ? [...s.events].reverse().slice(0, 18).map(event => <button key={event.id} type="button" onClick={() => setSelected(event)} className="flex min-h-14 w-full items-start gap-3 border-b border-border py-3 text-left hover:bg-muted focus-visible:bg-muted"><span className="font-mono text-xs text-muted-foreground">{String(event.index).padStart(2, "0")}</span><span className="min-w-0 flex-1 text-sm leading-5">{event.label}</span><span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">{new Date(event.createdAt).toLocaleTimeString()}</span></button>) : <p className="py-6 text-sm text-muted-foreground">Ask a participant to press the first highlighted action.</p>}</div></section></div>
      <section className="rounded-xl border border-border bg-muted/50 p-5" aria-label="Fictional sample activity"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-semibold">Sample activity · not live</h2><span className="text-xs text-muted-foreground">Fictional background records · never enter the event history</span></div><div className="mt-3 grid gap-3 sm:grid-cols-3">{displayedSamples.map(item => <div key={item.reference} className="min-w-0 border-t border-border pt-2"><p className="font-mono text-xs font-semibold">{item.reference}</p><p className="mt-1 text-sm">{item.title}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{item.desk} · {item.status}</p></div>)}</div></section>
    </main>
    <Sheet open={showIdeas} onOpenChange={setShowIdeas} title="Switch demo idea"><p className="mb-5 text-sm leading-6 text-muted-foreground">All connected screens switch together. Returning to an idea restores its roles and run.</p><div className="space-y-2">{([1, 2, 3, 4] as IdeaKey[]).map(ideaKey => <Button key={ideaKey} variant={ideaKey === s.ideaKey ? "primary" : "secondary"} className="w-full justify-between text-left" disabled={disabled || ideaKey === s.ideaKey} onClick={() => void switchIdea(ideaKey)}>Idea {ideaKey} · {IDEA_TITLES[ideaKey]}{ideaKey === s.ideaKey ? " · current" : ""}</Button>)}</div></Sheet>
    <Sheet open={Boolean(selected)} onOpenChange={open => !open && setSelected(null)} title="Accepted event detail">{selected && <div className="space-y-5 text-sm"><p className="text-base leading-7">{selected.label}</p><dl className="grid grid-cols-[6rem_1fr] gap-y-3 border-y border-border py-5"><dt className="text-muted-foreground">Actor</dt><dd>{selected.actor === "presenter" ? `Presenter${selected.onBehalfOf ? ` for ${roleTitle(s.ideaKey, selected.onBehalfOf)}` : ""}` : roleTitle(s.ideaKey, selected.actor)}</dd><dt className="text-muted-foreground">Time</dt><dd>{new Date(selected.createdAt).toLocaleString()}</dd><dt className="text-muted-foreground">Path</dt><dd>{selected.route ? `${selected.route.source} → ${selected.route.target} · ${selected.route.kind}` : "Workflow record"}</dd><dt className="text-muted-foreground">Reference</dt><dd className="break-all font-mono text-xs">{selected.reference ?? "None"}</dd></dl><details className="rounded-md border border-border p-4"><summary className="cursor-pointer font-semibold">Linked event metadata</summary><dl className="mt-4 space-y-3 break-all font-mono text-xs"><div><dt className="text-muted-foreground">Event index</dt><dd>{selected.index}</dd></div><div><dt className="text-muted-foreground">Previous hash</dt><dd>{selected.previousHash}</dd></div><div><dt className="text-muted-foreground">Event hash</dt><dd>{selected.hash}</dd></div></dl></details><p className="text-xs leading-5 text-muted-foreground">This is a simulated, hash-linked workflow event. It is not a real blockchain or settlement record.</p></div>}</Sheet>
    <Disclaimer />
  </div>;
}
