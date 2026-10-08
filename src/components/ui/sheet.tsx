"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import type { ReactNode } from "react";

export function Sheet({ open, onOpenChange, title, children }: { open: boolean; onOpenChange: (open: boolean) => void; title: string; children: ReactNode }) {
  return <Dialog.Root open={open} onOpenChange={onOpenChange}><AnimatePresence>{open && <Dialog.Portal forceMount>
    <Dialog.Overlay asChild><motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="fixed inset-0 z-40 bg-black/35" /></Dialog.Overlay>
    <Dialog.Content asChild><motion.section initial={{ x: 360 }} animate={{ x: 0 }} exit={{ x: 360 }} transition={{ duration: 0.22 }} className="fixed inset-y-0 right-0 z-50 w-full max-w-md overflow-y-auto border-l border-border bg-background p-6 shadow-xl">
      <div className="mb-6 flex items-center justify-between gap-4"><Dialog.Title className="text-xl font-semibold">{title}</Dialog.Title><Dialog.Close aria-label="Close details" className="inline-flex h-11 w-11 items-center justify-center rounded-md hover:bg-muted"><X size={20} /></Dialog.Close></div>
      {children}
    </motion.section></Dialog.Content>
  </Dialog.Portal>}</AnimatePresence></Dialog.Root>;
}
