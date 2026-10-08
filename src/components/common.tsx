"use client";
import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

export function Disclaimer() {
  return <p className="mx-auto mt-auto w-full max-w-6xl px-5 py-5 text-xs leading-5 text-muted-foreground sm:px-8">Simulation — fictional participants, balances and transactions. No real bank connection or money movement. This is not an official Vanguard product or endorsement.</p>;
}

export function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => { queueMicrotask(() => { const saved = localStorage.getItem("reserve-theme") === "dark"; setDark(saved); document.documentElement.classList.toggle("dark", saved); }); }, []);
  return <button aria-label={dark ? "Use light mode" : "Use dark mode"} onClick={() => { const next = !dark; setDark(next); document.documentElement.classList.toggle("dark", next); localStorage.setItem("reserve-theme", next ? "dark" : "light"); }} className="flex h-11 w-11 items-center justify-center rounded-md border border-border hover:bg-muted">{dark ? <Sun size={18} /> : <Moon size={18} />}</button>;
}
