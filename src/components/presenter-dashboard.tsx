"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import * as Switch from "@radix-ui/react-switch";
import { ArrowRight, Copy, ExternalLink, MoreHorizontal, Pause, Play, QrCode, RotateCcw, Wifi, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { Architecture } from "@/components/architecture";
import { Disclaimer, ThemeToggle } from "@/components/common";
import { formatMoney, type Role } from "@/lib/domain";
import { nextCaseRole, type CasePreset, type DemoCase } from "@/lib/demo-cases";
import type { Snapshot, WireEvent } from "@/lib/store";
import { useRoom } from "@/hooks/use-room";
import { IDEA_TITLES } from "@/lib/ideas";
import { ScenarioPresenter } from "@/components/ideas/scenario-presenter";

const names: Partial<Record<Role, string>> = { issuer: "Issuer Treasury", fund: "Vanguard Fund Operations", bank: "Bank Payments" };
const caseStatus: Record<DemoCase["status"], string> = {
  opened: "Waiting for Fund", fund_reviewed: "Waiting for Bank", bank_acknowledged: "Bank acknowledged",
};

function InvitePanel({ snapshot: s, url, onCopy }: {
  snapshot: Snapshot; url: string; onCopy: () => void;
}) {
  return <section className="rounded-xl border border-border bg-card p-5" aria-label="Invite role devices">
    <div className="flex items-start justify-between gap-4"><div><h2 className="text-lg font-semibold">Invite the three role devices</h2><p className="mt-1 max-w-md text-sm leading-6 text-muted-foreground">Participants scan once, then choose an available role. Other Chrome profiles and devices join independently.</p></div><QrCode size={21} className="shrink-0 text-primary" aria-hidden="true" /></div>
    <div id="join-qr" className="mt-5 flex flex-col items-start gap-3 border-t border-border pt-5">
      <div className="rounded-lg border border-border bg-white p-3 text-black"><QRCodeSVG value={url} size={188} marginSize={2} bgColor="#ffffff" fgColor="#111111" aria-label="QR code to join this demo room" /></div>
      <div className="min-w-0"><p className="font-mono text-sm font-semibold">ROOM {s.code}</p><p className="mt-2 max-w-sm break-all text-xs leading-5 text-muted-foreground">{url}</p><button type="button" onClick={onCopy} className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary"><Copy size={15} aria-hidden="true" /> Copy join link</button></div>
    </div>
  </section>;
}

function DeviceRoster({ snapshot: s, disabled, onKick }: { snapshot: Snapshot; disabled: boolean; onKick: (id: string) => void }) {
  return <section className="rounded-xl border border-border bg-card p-5" aria-label="Connected devices">
    <div className="flex flex-wrap items-end justify-between gap-2"><div><h2 className="text-lg font-semibold">Devices in this room</h2><p className="mt-1 text-sm text-muted-foreground">Presence refreshes every two seconds.</p></div><strong className="font-mono text-2xl">{s.presence.online} <span className="text-sm font-normal text-muted-foreground">online</span></strong></div>
    <p className="mt-3 text-xs text-muted-foreground">{s.presence.admins} admins · {s.presence.waiting} choosing a role · {s.presence.assigned} in roles</p>
    <div className="mt-4 border-t border-border">{s.presence.devices.length ? s.presence.devices.map(device => <div key={device.id} className="flex min-w-0 items-center justify-between gap-3 border-b border-border py-3 text-sm"><div className="min-w-0"><span className="block truncate font-mono font-semibold">{device.label}</span><span className="text-xs text-muted-foreground">{device.role ? names[device.role] : "Choosing a role"} · {device.connected ? "Online" : "Offline"}</span></div><Button variant="ghost" size="sm" onClick={() => onKick(device.id)} disabled={disabled} aria-label={`Kick ${device.label}`}>Kick</Button></div>) : <p className="py-5 text-sm text-muted-foreground">No participant devices yet. Show the QR to invite them.</p>}</div>
  </section>;
}

function BalanceStrip({ snapshot: s }: { snapshot: Snapshot }) {
  const b = s.state.balances;
  const items = [
    ["Bank cash", b.cash], ["Fund holdings", b.fund], ["Pending proceeds", b.pending], ["Holder obligations", b.obligations],
  ];
  const verificationPending = BigInt(b.pending) > 0n;
  return <section aria-label="Friday reserve position" className="rounded-xl border border-border bg-card p-5 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-semibold">Friday reserve position</h2><p className="mt-1 text-xs text-muted-foreground">Issuer and financial parties retain their own authoritative records.</p></div><span className={`rounded-full px-3 py-1 text-xs font-semibold ${verificationPending ? "bg-amber-100 text-amber-950 dark:bg-amber-900/40 dark:text-amber-100" : "bg-emerald-100 text-emerald-950 dark:bg-emerald-900/40 dark:text-emerald-100"}`}>{verificationPending ? "Bank verification pending" : "Illustrative coverage aligned"}</span></div>
    <dl className="mt-5 grid grid-cols-2 gap-x-5 gap-y-5 border-t border-border pt-5 lg:grid-cols-4">{items.map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 whitespace-nowrap font-mono text-xl font-semibold tabular-nums sm:text-2xl">{formatMoney(value)}</dd></div>)}</dl>
    <p className="mt-5 border-t border-border pt-4 text-xs leading-5 text-muted-foreground">{verificationPending ? `${formatMoney(b.pending)} is awaiting bank confirmation. Do not count it as available cash or claim confirmed 1:1 backing yet.` : `Illustrative fund holdings plus confirmed bank cash: ${formatMoney(BigInt(b.fund) + BigInt(b.cash))}. This is not a legal reserve attestation.`}</p>
  </section>;
}

function FridayPanel({ snapshot: s, disabled, onTakeover, onControl }: {
  snapshot: Snapshot; disabled: boolean; onTakeover: () => void; onControl: (name: string) => void;
}) {
  const b = s.state.balances;
  return <section className="rounded-xl border border-border bg-card p-5 sm:p-6" aria-label="Friday scenario control">
    <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-semibold">Main Friday action</h2><span className="font-mono text-sm text-muted-foreground">{s.state.step}/6</span></div>
    <p className="mt-6 text-xs font-semibold text-primary">{s.next ? `${names[s.next.role]} acts next` : "Scenario complete"}</p>
    <p className="mt-2 text-xl font-semibold">{s.next?.label ?? "All six financial steps are complete."}</p>
    <p className="mt-4 text-sm leading-6 text-muted-foreground">{s.state.step === 3 ? `${formatMoney(b.redemption)} of fund proceeds are pending. Bank cash remains ${formatMoney(b.cash)} until Bank confirms receipt.` : `Payout approval requires ${formatMoney(BigInt(b.plannedPayout) + BigInt(b.requiredBuffer))} confirmed bank cash.`}</p>
    {s.next && <Button className="mt-6 w-full" onClick={onTakeover} disabled={disabled || s.status !== "active" || (s.state.bankDelayed && s.next.type === "confirm_proceeds")}>Act on behalf of {names[s.next.role]} <ArrowRight size={16} aria-hidden="true" /></Button>}
    <div className="mt-6 border-t border-border pt-4"><h3 className="text-sm font-semibold">Presenter exceptions</h3><div className="mt-3 flex flex-wrap gap-2"><Button variant="secondary" size="sm" onClick={() => onControl(s.state.bankDelayed ? "release_bank" : "delay_bank")} disabled={disabled || s.state.step !== 3}>{s.state.bankDelayed ? "Release bank delay" : "Delay bank"}</Button><Button variant="secondary" size="sm" onClick={() => onControl("repeat_bank")} disabled={disabled || s.state.step < 4}>Repeat bank notice</Button></div></div>
  </section>;
}

function PracticePanel({ snapshot: s, disabled, onCreate, onAdvance }: {
  snapshot: Snapshot; disabled: boolean; onCreate: (preset: CasePreset) => void; onAdvance: (item: DemoCase) => void;
}) {
  const [preset, setPreset] = useState<CasePreset>("10m");
  const open = s.cases.filter(item => item.status !== "bank_acknowledged");
  return <section className="rounded-xl border border-border bg-card p-5 sm:p-6" aria-label="Practice coordination cases">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-semibold">Practice coordination</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">Repeatable issuer → fund → bank messages. No reserve balance changes.</p></div><span className="rounded-full bg-secondary px-3 py-1 font-mono text-xs">{s.cases.length}/20 cases</span></div>
    <div className="mt-5 flex flex-wrap items-end gap-2"><label className="text-xs font-semibold" htmlFor="admin-case-preset">Display amount<select id="admin-case-preset" className="mt-1 block h-11 rounded-md border border-border bg-background px-3 text-sm" value={preset} onChange={event => setPreset(event.target.value as CasePreset)}><option value="5m">$5m</option><option value="10m">$10m</option><option value="25m">$25m</option></select></label><Button variant="secondary" onClick={() => onCreate(preset)} disabled={disabled || s.status !== "active" || s.cases.length >= 20}>Open as Issuer</Button></div>
    <div className="mt-5 max-h-64 overflow-y-auto border-t border-border">{open.length ? open.map(item => {
      const role = nextCaseRole(item.status);
      return <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border py-3 text-sm"><div><p className="font-mono font-semibold">{item.reference} · {formatMoney(item.amount)}</p><p className="mt-1 text-xs text-muted-foreground">{caseStatus[item.status]} · Practice only</p></div>{role && <Button size="sm" variant="ghost" disabled={disabled || s.status !== "active"} onClick={() => onAdvance(item)}>Advance as {names[role]}</Button>}</div>;
    }) : <p className="py-5 text-sm text-muted-foreground">No open practice cases. Ask Issuer to send a request, or open one here.</p>}</div>
  </section>;
}

function EventFeed({ events, onSelect, code }: { events: WireEvent[]; onSelect: (event: WireEvent) => void; code: string }) {
  return <section className="rounded-xl border border-border bg-card" aria-label="Accepted event timeline"><div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-4"><div><h2 className="text-lg font-semibold">Accepted activity</h2><p className="mt-1 text-xs text-muted-foreground">Only accepted server actions enter this timeline.</p></div><Link href={`/results/${code}`} className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-primary">Full replay <ExternalLink size={15} aria-hidden="true" /></Link></div>
    <div className="max-h-80 overflow-y-auto">{events.length ? [...events].reverse().slice(0, 15).map(event => <button key={event.id} type="button" onClick={() => onSelect(event)} className="flex min-h-14 w-full items-center gap-3 border-b border-border px-5 py-3 text-left hover:bg-muted focus-visible:bg-muted"><span className="font-mono text-xs text-muted-foreground">{String(event.index).padStart(2, "0")}</span><span className="min-w-0 flex-1 text-sm leading-5">{event.label}</span><span className="hidden whitespace-nowrap text-xs text-muted-foreground sm:inline">{new Date(event.createdAt).toLocaleTimeString()}</span></button>) : <p className="px-5 py-7 text-sm text-muted-foreground">Start the scenario, then ask a role to press its highlighted action.</p>}</div>
  </section>;
}

export function PresenterDashboard({ code }: { code: string }) {
  const { snapshot: s, connected, busy, error, animatedEvent, post } = useRoom(code);
  const [selected, setSelected] = useState<WireEvent | null>(null);
  const [localJoinUrl, setLocalJoinUrl] = useState("");
  const [showQr, setShowQr] = useState(false);
  const [notice, setNotice] = useState("");
  useEffect(() => { queueMicrotask(() => setLocalJoinUrl(`${location.origin}/join/${code}`)); }, [code]);
  const joinUrl = s?.joinUrl ?? localJoinUrl;
  const disabled = !connected || busy;
  async function control(name: string, extra: object = {}) { try { await post("controls", { control: name, ...extra }); } catch {} }
  async function takeover() { if (s?.next) try { await post("actions", { action: s.next.type, onBehalfOf: s.next.role }); } catch {} }
  async function kick(id: string) { try { await post("sessions/kick", { sessionId: id }); setNotice("Device removed. It can rejoin with the same QR link."); } catch {} }
  async function copyJoin() { try { await navigator.clipboard.writeText(joinUrl); setNotice("Join link copied."); } catch { setNotice("Copy failed. Use the visible join link."); } }
  async function createCase(preset: CasePreset) { try { const result = await post<{ message?: string }>("cases", { preset, onBehalfOf: "issuer" }); setNotice(result.message ?? "Practice request opened."); } catch {} }
  async function advance(item: DemoCase) { const role = nextCaseRole(item.status); if (!role) return; try { const result = await post<{ message?: string }>(`cases/${item.id}/actions`, { action: role === "fund" ? "fund_review" : "bank_acknowledge", onBehalfOf: role }); setNotice(result.message ?? "Practice case updated."); } catch {} }

  if (!s) return <div className="min-h-screen bg-background p-6 text-foreground"><div className="mx-auto max-w-6xl"><div className="h-10 w-64 animate-pulse rounded bg-muted" /><div className="mt-6 h-80 animate-pulse rounded-xl bg-muted" />{error && <p role="alert" className="mt-5 text-destructive">{error}</p>}</div></div>;
  if (s.ideaKey !== 1) return <ScenarioPresenter code={code} snapshot={s} connected={connected} busy={busy}
    error={error} animatedEvent={animatedEvent} post={post} />;
  return <div className="flex min-h-screen flex-col bg-background text-foreground"><a href="#presenter-main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-background focus:p-3">Skip to main content</a>
    <header className="border-b border-border bg-card"><div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-8"><div className="flex items-center gap-5"><div className="text-sm font-bold tracking-tight">RESERVE <span className="text-primary">OPERATIONS</span> LAB</div><span className="hidden font-mono text-xs text-muted-foreground sm:inline">{s.code} · RUN {s.runNumber}</span></div><div className="flex items-center gap-3"><span className={`inline-flex items-center gap-1 text-xs ${connected ? "text-foreground" : "text-destructive"}`}>{connected ? <Wifi size={15} aria-hidden="true" /> : <WifiOff size={15} aria-hidden="true" />}{connected ? "Connected" : "Offline"}</span><ThemeToggle /></div></div></header>
    <main id="presenter-main" className="mx-auto w-full max-w-[1440px] flex-1 space-y-5 px-4 py-5 sm:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-2 text-sm">
        <span className="font-semibold">Idea 1 of 4 · {IDEA_TITLES[1]}</span>
        <div className="flex items-center gap-2">
          {(s.state.step >= 6 || s.status === "ended") && <Button size="sm" onClick={() => control("switch_idea", { ideaKey: 2 })} disabled={disabled}>Next idea <ArrowRight size={15} aria-hidden="true" /></Button>}
          <details className="relative"><summary aria-label="Choose another idea" className="flex min-h-11 min-w-11 cursor-pointer list-none items-center justify-center rounded-md border border-border hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"><MoreHorizontal size={20} aria-hidden="true" /></summary>
            <div className="absolute right-0 z-30 mt-2 w-64 rounded-lg border border-border bg-popover p-2 shadow-lg">
              <p className="px-3 py-2 text-xs text-muted-foreground">Switch the room for everyone</p>
              {([1, 2, 3, 4] as const).map(ideaKey => <button key={ideaKey} type="button" disabled={disabled || ideaKey === s.ideaKey}
                onClick={() => control("switch_idea", { ideaKey })} className="flex min-h-11 w-full items-center rounded-md px-3 text-left text-sm hover:bg-muted disabled:opacity-50">Idea {ideaKey} · {IDEA_TITLES[ideaKey]}</button>)}
            </div>
          </details>
        </div>
      </div>
      <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm text-muted-foreground">Friday customer redemptions · {s.scenarioVersion === 2 ? "Deck-aligned" : "Original"} run {s.runNumber}</p><h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">Operations control room</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Guide Issuer, Fund and Bank through one real scenario path, then reveal what a shared workflow record changes.</p></div><div className="flex w-full flex-wrap gap-2 sm:w-auto"><Button variant="secondary" onClick={() => setShowQr(value => !value)} aria-expanded={showQr}><QrCode size={16} aria-hidden="true" /> {showQr ? "Hide QR" : "Show QR"}</Button>{s.status === "lobby" ? <Button onClick={() => control("start")} disabled={disabled}>Start scenario <ArrowRight size={16} aria-hidden="true" /></Button> : <>{s.status === "active" ? <Button variant="secondary" onClick={() => control("pause")} disabled={disabled}><Pause size={16} aria-hidden="true" /> Pause</Button> : s.status === "paused" ? <Button onClick={() => control("resume")} disabled={disabled}><Play size={16} aria-hidden="true" /> Resume</Button> : null}<Button variant="secondary" onClick={() => control("reset")} disabled={disabled}><RotateCcw size={16} aria-hidden="true" /> Restart</Button><Button variant="danger" onClick={() => control("end")} disabled={disabled || s.status === "ended"}>End run</Button></>}</div></div>
      {error && <p role="alert" className="rounded-lg border border-destructive p-3 text-sm text-destructive">{error}{!connected && " Actions are disabled until the connection returns."}</p>}
      {notice && <p role="status" className="rounded-lg bg-secondary p-3 text-sm">{notice}</p>}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 sm:px-5"><div className="flex flex-wrap items-center gap-3 text-sm font-semibold"><span className={s.mode === "conventional" ? "text-foreground" : "text-muted-foreground"}>Without blockchain</span><Switch.Root checked={s.mode === "ledger"} onCheckedChange={checked => control("set_mode", { mode: checked ? "ledger" : "conventional" })} disabled={disabled} aria-label="Show shared workflow ledger" className="relative h-7 w-12 rounded-full bg-secondary data-[state=checked]:bg-primary"><Switch.Thumb className="block h-5 w-5 translate-x-1 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-6" /></Switch.Root><span className={s.mode === "ledger" ? "text-foreground" : "text-muted-foreground"}>With blockchain</span></div><p className="text-xs text-muted-foreground">Same actions and balances. Different record-sharing view.</p></div>
      <div className={showQr ? "grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(280px,.34fr)]" : ""}>
        <section className="min-w-0 overflow-hidden rounded-xl border border-border bg-card" aria-label="Live workflow diagram"><div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-4"><div><h2 className="text-lg font-semibold">Live workflow</h2><p className="mt-1 text-xs text-muted-foreground">Accepted device actions appear here. Refresh never replays old animation.</p></div><span className="font-mono text-xs text-muted-foreground">{s.presence.assigned}/3 roles assigned</span></div><Architecture snapshot={s} animatedEvent={animatedEvent} /></section>
        {showQr && <InvitePanel snapshot={s} url={joinUrl} onCopy={copyJoin} />}
      </div>
      <BalanceStrip snapshot={s} />
      <div className="grid gap-5 lg:grid-cols-2"><FridayPanel snapshot={s} disabled={disabled} onTakeover={takeover} onControl={name => control(name)} /><PracticePanel snapshot={s} disabled={disabled} onCreate={createCase} onAdvance={advance} /></div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(280px,.8fr)]"><EventFeed events={s.events} onSelect={setSelected} code={code} /><DeviceRoster snapshot={s} disabled={disabled} onKick={kick} /></div>
    </main>
    <Sheet open={Boolean(selected)} onOpenChange={open => !open && setSelected(null)} title="Event detail">{selected && <div className="space-y-5 text-sm"><p className="text-base leading-7">{selected.label}</p><dl className="grid grid-cols-[7rem_1fr] gap-y-3 border-y border-border py-5"><dt className="text-muted-foreground">Actor</dt><dd className="capitalize">{selected.actor}{selected.onBehalfOf ? ` on behalf of ${selected.onBehalfOf}` : ""}</dd><dt className="text-muted-foreground">Time</dt><dd>{new Date(selected.createdAt).toLocaleString()}</dd><dt className="text-muted-foreground">Amount</dt><dd>{selected.amount ? formatMoney(selected.amount) : "No cash movement"}</dd></dl><details className="rounded-md border border-border p-4"><summary className="cursor-pointer font-semibold">Technical identifiers</summary><dl className="mt-4 space-y-3 break-all font-mono text-xs"><div><dt className="text-muted-foreground">Practice or scenario reference</dt><dd>{selected.reference ?? "None"}</dd></div><div><dt className="text-muted-foreground">Event index</dt><dd>{selected.index}</dd></div><div><dt className="text-muted-foreground">Previous hash</dt><dd>{selected.previousHash}</dd></div><div><dt className="text-muted-foreground">Event hash</dt><dd>{selected.hash}</dd></div></dl></details></div>}</Sheet>
    <Disclaimer />
  </div>;
}
