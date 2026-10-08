"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, MonitorPlay } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/client";
import { Disclaimer, ThemeToggle } from "@/components/common";

export default function Home() {
  const router = useRouter();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

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
        <p className="mt-6 max-w-xl text-lg leading-8 text-muted-foreground">One shared demonstration of an issuer, a fund operator, and a bank handling a $450m customer payout. Open the admin dashboard, show its QR code, and invite the three role devices.</p>
        <div className="mt-10 border-t border-border pt-6">
          <h2 className="text-base font-semibold">What the demonstration shows</h2>
          <ol className="mt-4 space-y-3 text-base text-muted-foreground">
            <li><span className="mr-3 font-mono text-primary">01</span> A fund request can be accepted before bank cash is available.</li>
            <li><span className="mr-3 font-mono text-primary">02</span> Each action has an owner and a confirmation point.</li>
            <li><span className="mr-3 font-mono text-primary">03</span> The same transaction can be shown through separate records or a shared workflow ledger.</li>
          </ol>
        </div>
      </section>
      <section className="self-start rounded-xl border border-border bg-card p-6 shadow-sm sm:p-8" aria-label="Admin access">
        <div className="mb-7 flex h-12 w-12 items-center justify-center rounded-lg bg-secondary text-primary"><MonitorPlay size={22} /></div>
        <h2 className="text-2xl font-semibold">Run the live demo</h2>
        <p className="mt-3 leading-7 text-muted-foreground">Enter the admin dashboard to reveal the QR invite, see connected devices, and guide the scenario. The shared room stays available between visits.</p>
        <div className="mt-7 rounded-lg bg-secondary p-4 text-sm leading-6"><span className="font-semibold">Public demo access.</span> Anyone using this website can open the admin controls. All data and transactions are fictional.</div>
        <Button className="mt-7 w-full" onClick={openControls} disabled={working}>{working ? "Opening…" : "Enter admin dashboard"}<ArrowRight size={17} /></Button>
        {error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
      </section>
    </main>
    <Disclaimer />
  </div>;
}
