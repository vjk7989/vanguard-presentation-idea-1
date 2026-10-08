"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import * as Switch from "@radix-ui/react-switch";
import { ArrowRight, Copy, ExternalLink, Pause, Play, RotateCcw, Wifi, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { Architecture } from "@/components/architecture";
import { Disclaimer, ThemeToggle } from "@/components/common";
import { formatMoney, type Role } from "@/lib/domain";
import type { Snapshot, WireEvent } from "@/lib/store";
import { useRoom } from "@/hooks/use-room";

const names: Record<Role, string> = { issuer: "Issuer treasury", fund: "Fund operations", bank: "Bank operations" };

export function PresenterDashboard({ code }: { code: string }) {
  const room = useRoom(code);
  const { snapshot: s, connected, busy, error, animatedEvent, post } = room;
  const [selected, setSelected] = useState<WireEvent | null>(null);
  const [joinUrl, setJoinUrl] = useState("");
  useEffect(() => { queueMicrotask(() => setJoinUrl(`${location.origin}/join/${code}`)); }, [code]);
  async function control(name: string, extra: object = {}) { try { await post("controls", { control: name, ...extra }); } catch {} }
  async function takeover() {
    if (!s?.next) return;
    try { await post("actions", { action: s.next.type, onBehalfOf: s.next.role }); } catch {}
  }
  async function kick(role: Role) { try { await post("roles/release", { role }); } catch {} }

  if (!s) return <Shell><div className="mx-auto max-w-6xl p-8"><div className="h-12 w-64 animate-pulse rounded bg-muted" /><div className="mt-6 h-80 animate-pulse rounded-xl bg-muted" />{error && <p role="alert" className="mt-4 text-destructive">{error}</p>}</div></Shell>;
  const actionsDisabled = !connected || busy;
  const join = <div className="flex flex-col items-center gap-4 rounded-xl border border-border bg-card p-5 text-center">
    {joinUrl && <QRCodeSVG value={joinUrl} size={164} marginSize={2} bgColor="transparent" fgColor="currentColor" aria-label="QR code to join this room" />}
    <div><div className="text-sm text-muted-foreground">Room code</div><div className="font-mono text-3xl font-semibold tracking-wider">{s.code}</div></div>
    <button onClick={() => navigator.clipboard.writeText(joinUrl)} className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary"><Copy size={16} /> Copy join link</button>
  </div>;
  const roles = <div className="space-y-2">{s.roles.map(item => <div key={item.role} className="flex min-h-12 items-center justify-between gap-3 border-b border-border py-2 text-sm">
    <div><span className="font-semibold">{names[item.role]}</span><span className="ml-2 text-muted-foreground">{item.claimed ? item.connected ? "Connected" : "Disconnected" : "Available"}</span></div>
    {item.claimed && <Button size="sm" variant="ghost" onClick={() => kick(item.role)} disabled={actionsDisabled} aria-label={`Kick ${names[item.role]}`}>Kick</Button>}
  </div>)}</div>;
  return <Shell>
    <header className="border-b border-border"><div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-3 px-5 py-3 sm:px-8">
      <div className="flex items-center gap-5"><div className="text-sm font-bold tracking-tight">RESERVE <span className="text-primary">OPERATIONS</span> LAB</div><span className="hidden font-mono text-sm text-muted-foreground sm:inline">{s.code}</span></div>
      <div className="flex items-center gap-3"><span className={`inline-flex items-center gap-1 text-xs ${connected ? "text-foreground" : "text-destructive"}`}>{connected ? <Wifi size={15} /> : <WifiOff size={15} />}{connected ? "Connected" : "Offline"}</span><ThemeToggle /></div>
    </div></header>
    <main className="mx-auto max-w-[1440px] px-5 py-5 sm:px-8">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div><p className="text-sm text-muted-foreground">Friday customer redemptions · Run {s.runNumber}</p><h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">Operations control room</h1></div>
        <div className="flex flex-wrap items-center gap-2">
          {s.status === "lobby" ? <Button onClick={() => control("start")} disabled={actionsDisabled}>Start scenario <ArrowRight size={16} /></Button> : <>
            {s.status === "active" ? <Button variant="secondary" onClick={() => control("pause")} disabled={actionsDisabled}><Pause size={16} /> Pause</Button> : s.status === "paused" ? <Button onClick={() => control("resume")} disabled={actionsDisabled}><Play size={16} /> Resume</Button> : null}
            <Button variant="secondary" onClick={() => control("reset")} disabled={actionsDisabled}><RotateCcw size={16} /> Restart</Button>
            <Button variant="danger" onClick={() => control("end")} disabled={actionsDisabled || s.status === "ended"}>End run</Button>
          </>}
        </div>
      </div>
      {error && <p role="alert" className="mb-4 rounded-md border border-destructive p-3 text-sm text-destructive">{error} Actions are disabled until the connection returns.</p>}
      {s.status === "lobby" ? <div className="grid gap-8 lg:grid-cols-[320px_1fr]">
        {join}<section><h2 className="mb-3 text-lg font-semibold">Role positions</h2>{roles}<p className="mt-5 max-w-xl text-sm leading-6 text-muted-foreground">Each participant chooses one role. You can start with an empty position and perform its action from this laptop.</p><div className="mt-7 border-t border-border pt-5"><h3 className="font-semibold">Presenter guide</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">Ask who owns each confirmation. After fund processing, point out that $200m is pending and bank cash remains $300m. Switch views without changing the financial state.</p></div></section>
      </div> : <>
        <div className="mb-6 grid gap-5 md:grid-cols-[260px_1fr]">{join}<div><h2 className="text-lg font-semibold">Participants</h2>{roles}<p className="mt-3 text-sm text-muted-foreground">Kicked participants can scan the QR code or tap Rejoin on their device.</p></div></div>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-4 border-y border-border py-3">
          <div className="flex items-center gap-3 text-sm font-semibold"><span className={s.mode === "conventional" ? "text-foreground" : "text-muted-foreground"}>Without blockchain</span><Switch.Root checked={s.mode === "ledger"} onCheckedChange={checked => control("set_mode", { mode: checked ? "ledger" : "conventional" })} disabled={actionsDisabled} aria-label="Show shared workflow ledger" className="relative h-7 w-12 rounded-full bg-secondary data-[state=checked]:bg-primary"><Switch.Thumb className="block h-5 w-5 translate-x-1 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-6" /></Switch.Root><span className={s.mode === "ledger" ? "text-foreground" : "text-muted-foreground"}>With blockchain</span></div>
          <p className="text-xs text-muted-foreground">Same transaction and controls. Different record-sharing design.</p>
        </div>
        <BalanceStrip balances={s.state.balances} />
        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(300px,.75fr)]">
          <section className="overflow-hidden rounded-xl border border-border bg-card"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4"><div><h2 className="text-lg font-semibold">Architecture</h2><p className="text-xs text-muted-foreground">{s.mode === "ledger" ? "Linked workflow events · financial parties retain their records" : "Separate issuer, fund and bank records · conventional reconciliation"}</p></div><span className="text-xs text-muted-foreground">Dashed: message · Solid: confirmed cash</span></div><Architecture mode={s.mode} step={s.state.step} animatedEvent={animatedEvent} /></section>
          <section className="rounded-xl border border-border bg-card p-5"><div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Current step</h2><span className="font-mono text-sm text-muted-foreground">{s.state.step}/6</span></div>
            <p className="mt-6 text-sm font-semibold text-muted-foreground">Next actor</p><p className="mt-1 text-xl font-semibold">{s.next ? names[s.next.role] : "Scenario complete"}</p>
            <p className="mt-4 text-sm leading-6">{s.next?.label ?? "All six steps are complete. Review the results."}</p>
            {s.state.bankDelayed && s.state.step === 3 && <p className="mt-4 rounded-md bg-secondary p-3 text-sm">Bank confirmation is delayed. $200m remains pending. Available cash is $300m.</p>}
            {s.state.step === 3 && <p className="mt-3 text-sm text-muted-foreground">Payout approval needs $500m available cash, including the $50m buffer.</p>}
            {s.next && <Button className="mt-6 w-full" onClick={takeover} disabled={actionsDisabled || s.status !== "active" || (s.state.bankDelayed && s.next.type === "confirm_proceeds")}>Act on behalf of {names[s.next.role]}</Button>}
            <div className="mt-6 border-t border-border pt-4"><h3 className="mb-3 text-sm font-semibold">Presenter exceptions</h3><div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => control(s.state.bankDelayed ? "release_bank" : "delay_bank")} disabled={actionsDisabled || s.state.step !== 3}>{s.state.bankDelayed ? "Release bank delay" : "Delay bank"}</Button>
              <Button size="sm" variant="secondary" onClick={() => control("repeat_bank")} disabled={actionsDisabled || s.state.step < 4}>Repeat bank notice</Button>
            </div></div>
          </section>
        </div>
        <section className="mt-5 rounded-xl border border-border bg-card"><div className="flex items-center justify-between border-b border-border px-5 py-4"><h2 className="text-lg font-semibold">Event timeline</h2><Link className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-primary" href={`/results/${code}`}>Results and replay <ExternalLink size={15} /></Link></div>
          <div className="max-h-72 overflow-y-auto">{s.events.length ? [...s.events].reverse().map(event => <button key={event.id} onClick={() => setSelected(event)} className="flex min-h-14 w-full items-center gap-4 border-b border-border px-5 py-3 text-left hover:bg-muted focus-visible:bg-muted"><span className="font-mono text-xs text-muted-foreground">{String(event.index).padStart(2, "0")}</span><span className="min-w-0 flex-1 truncate text-sm">{event.label}</span><span className="hidden text-xs text-muted-foreground sm:inline">{new Date(event.createdAt).toLocaleTimeString()}</span></button>) : <p className="px-5 py-8 text-sm text-muted-foreground">Events will appear after the first action.</p>}</div>
        </section>
      </>}
    </main>
    <Sheet open={Boolean(selected)} onOpenChange={open => !open && setSelected(null)} title="Event detail">{selected && <div className="space-y-5 text-sm"><p className="text-base leading-7">{selected.label}</p><dl className="grid grid-cols-[7rem_1fr] gap-y-3 border-y border-border py-5"><dt className="text-muted-foreground">Actor</dt><dd className="capitalize">{selected.actor}{selected.onBehalfOf ? ` on behalf of ${selected.onBehalfOf}` : ""}</dd><dt className="text-muted-foreground">Time</dt><dd>{new Date(selected.createdAt).toLocaleString()}</dd><dt className="text-muted-foreground">Amount</dt><dd>{selected.amount ? formatMoney(selected.amount) : "No cash movement"}</dd></dl><details className="rounded-md border border-border p-4"><summary className="cursor-pointer font-semibold">Technical identifiers</summary><dl className="mt-4 space-y-3 break-all font-mono text-xs"><div><dt className="text-muted-foreground">Simulated reference</dt><dd>{selected.reference ?? "None"}</dd></div><div><dt className="text-muted-foreground">Simulated ledger index</dt><dd>{selected.index}</dd></div><div><dt className="text-muted-foreground">Previous hash</dt><dd>{selected.previousHash}</dd></div><div><dt className="text-muted-foreground">Event hash</dt><dd>{selected.hash}</dd></div></dl></details></div>}</Sheet>
    <Disclaimer />
  </Shell>;
}

function Shell({ children }: { children: React.ReactNode }) { return <div className="flex min-h-screen flex-col bg-background text-foreground">{children}</div>; }

function BalanceStrip({ balances }: { balances: Snapshot["state"]["balances"] }) {
  const items = [
    ["Available bank cash", balances.cash], ["Fund holdings", balances.fund], ["Pending proceeds", balances.pending],
    ["Issuer obligations", balances.obligations], ["Required cash buffer", balances.requiredBuffer],
  ];
  return <section aria-label="Financial balances" className="grid grid-cols-2 gap-x-5 gap-y-4 border-b border-border pb-5 sm:grid-cols-3 lg:grid-cols-5">{items.map(([label, value]) => <div key={label} className="min-w-0"><div className="text-xs leading-5 text-muted-foreground">{label}</div><div className="mt-1 whitespace-nowrap font-mono text-xl font-semibold tabular-nums">{formatMoney(value)}</div></div>)}</section>;
}
