"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { ArrowRight, QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/client";
import { Disclaimer, ThemeToggle } from "@/components/common";
import { DEMO_ROOM_CODE } from "@/lib/demo";

export default function Home() {
  const router = useRouter();
  const [joinUrl, setJoinUrl] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { queueMicrotask(() => setJoinUrl(`${location.origin}/join/${DEMO_ROOM_CODE}`)); }, []);

  async function openControls() {
    setWorking(true); setError("");
    try {
      const result = await api<{ code: string }>("/api/rooms", { requestId: crypto.randomUUID() });
      router.push(`/presenter/${result.code}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not open the demo room."); }
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
        <p className="mt-6 max-w-xl text-lg leading-8 text-muted-foreground">One shared demonstration of an issuer, a fund operator, and a bank handling a $450m customer payout. Scan the QR code to join from a phone, or open the public control room.</p>
        <div className="mt-10 border-t border-border pt-6">
          <h2 className="text-base font-semibold">What the demonstration shows</h2>
          <ol className="mt-4 space-y-3 text-base text-muted-foreground">
            <li><span className="mr-3 font-mono text-primary">01</span> A fund request can be accepted before bank cash is available.</li>
            <li><span className="mr-3 font-mono text-primary">02</span> Each action has an owner and a confirmation point.</li>
            <li><span className="mr-3 font-mono text-primary">03</span> The same transaction can be shown through separate records or a shared workflow ledger.</li>
          </ol>
        </div>
      </section>
      <section className="self-start rounded-xl border border-border bg-card p-6 shadow-sm sm:p-8" aria-label="Demo access">
        <div className="mb-7 flex h-12 w-12 items-center justify-center rounded-lg bg-secondary text-primary"><QrCode size={22} /></div>
        <h2 className="text-2xl font-semibold">Join the shared demo</h2>
        <p className="mt-2 text-muted-foreground">This room stays available. Scan the QR code or open the join link on your device.</p>
        <div className="mt-7 flex justify-center rounded-lg border border-border bg-background p-4">{joinUrl && <QRCodeSVG value={joinUrl} size={180} marginSize={2} bgColor="transparent" fgColor="currentColor" aria-label="QR code to join the shared demo" />}</div>
        <p className="mt-3 text-center font-mono text-sm text-muted-foreground">ROOM {DEMO_ROOM_CODE}</p>
        <Button asChild className="mt-6 w-full"><Link href={`/join/${DEMO_ROOM_CODE}`}>Join demo <ArrowRight size={17} /></Link></Button>
        <div className="my-6 h-px bg-border" />
        <p className="mb-3 text-sm text-muted-foreground">Anyone can open the presenter view for this public demo.</p>
        <Button className="w-full" variant="secondary" onClick={openControls} disabled={working}>{working ? "Opening…" : "Open control room"}<ArrowRight size={17} /></Button>
        {error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
      </section>
    </main>
    <Disclaimer />
  </div>;
}
