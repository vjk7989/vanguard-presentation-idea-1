"use client";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/client";
import { Disclaimer, ThemeToggle } from "@/components/common";

export default function Home() {
  const router = useRouter();
  const [accessCode, setAccessCode] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  async function create(event: FormEvent) {
    event.preventDefault(); setWorking(true); setError("");
    try {
      const result = await api<{ code: string }>("/api/rooms", { accessCode, requestId: crypto.randomUUID() });
      router.push(`/presenter/${result.code}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Room creation failed."); }
    finally { setWorking(false); }
  }

  return <div className="min-h-screen bg-background text-foreground">
    <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
      <div className="text-sm font-bold tracking-tight">RESERVE <span className="text-primary">OPERATIONS</span> LAB</div>
      <ThemeToggle />
    </header>
    <main className="mx-auto grid max-w-6xl gap-12 px-5 pb-16 pt-12 sm:px-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,.7fr)] lg:gap-20 lg:pt-24">
      <section className="max-w-2xl">
        <p className="mb-5 text-sm font-semibold text-primary">Friday customer redemptions</p>
        <h1 className="max-w-xl text-balance text-4xl font-bold leading-tight tracking-tight sm:text-5xl">Follow the cash. See who confirms each step.</h1>
        <p className="mt-6 max-w-xl text-lg leading-8 text-muted-foreground">A room-based demonstration of an issuer, a fund operator, and a bank handling a $450m customer payout. Participants use their phones while the presenter controls the shared view.</p>
        <div className="mt-10 border-t border-border pt-6">
          <h2 className="text-base font-semibold">What the demonstration shows</h2>
          <ol className="mt-4 space-y-3 text-base text-muted-foreground">
            <li><span className="mr-3 font-mono text-primary">01</span> A fund request can be accepted before bank cash is available.</li>
            <li><span className="mr-3 font-mono text-primary">02</span> Each action has an owner and a confirmation point.</li>
            <li><span className="mr-3 font-mono text-primary">03</span> The same transaction can be shown through separate records or a shared workflow ledger.</li>
          </ol>
        </div>
      </section>
      <section className="self-start rounded-xl border border-border bg-card p-6 shadow-sm sm:p-8" aria-label="Room access">
        <div className="mb-7 flex h-12 w-12 items-center justify-center rounded-lg bg-secondary text-primary"><LockKeyhole size={22} /></div>
        <h2 className="text-2xl font-semibold">Start a demo room</h2>
        <p className="mt-2 text-muted-foreground">Create a room, then invite the three role devices with a QR code.</p>
        <form onSubmit={create} className="mt-7 space-y-4">
          <label className="block text-sm font-semibold" htmlFor="access-code">Presenter access code</label>
          <input id="access-code" type="password" autoComplete="off" required value={accessCode} onChange={e => setAccessCode(e.target.value)} className="h-12 w-full rounded-md border border-border bg-background px-4 text-foreground" />
          <div className="text-sm text-muted-foreground">Scenario: Friday customer redemptions</div>
          <Button className="w-full" type="submit" disabled={working}>{working ? "Creating room…" : "Create demo room"}<ArrowRight size={17} /></Button>
        </form>
        <div className="my-7 flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border" />OR JOIN A ROOM<span className="h-px flex-1 bg-border" /></div>
        <form onSubmit={e => { e.preventDefault(); if (roomCode.trim()) router.push(`/join/${roomCode.trim().toUpperCase()}`); }} className="flex gap-2">
          <input aria-label="Six-character room code" maxLength={6} placeholder="Room code" value={roomCode} onChange={e => setRoomCode(e.target.value.toUpperCase())} className="h-11 min-w-0 flex-1 rounded-md border border-border bg-background px-4 font-mono uppercase" />
          <Button type="submit" variant="secondary" disabled={roomCode.trim().length !== 6}>Join</Button>
        </form>
        {error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
      </section>
    </main>
    <Disclaimer />
  </div>;
}
