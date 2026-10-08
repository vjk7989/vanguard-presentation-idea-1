"use client";
import { useEffect, useMemo, useState } from "react";
import { ReactFlow, Background, Handle, MarkerType, Position, type Edge, type Node, type NodeProps } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { Mode } from "@/lib/domain";
import type { WireEvent } from "@/lib/store";

function PartyNode({ data }: NodeProps) {
  const node = data as { title: string; subtitle: string; highlight?: boolean };
  return <div className={`min-w-36 rounded-lg border bg-card px-4 py-3 text-center shadow-sm ${node.highlight ? "border-primary ring-2 ring-primary/20" : "border-border"}`}>
    <Handle type="target" position={Position.Left} className="!h-1 !w-1 !border-0 !bg-transparent" />
    <div className="text-sm font-semibold text-foreground">{node.title}</div><div className="mt-1 text-xs text-muted-foreground">{node.subtitle}</div>
    <Handle type="source" position={Position.Right} className="!h-1 !w-1 !border-0 !bg-transparent" />
  </div>;
}

const nodeTypes = { party: PartyNode };
const party = (id: string, title: string, subtitle: string, x: number, y: number, highlight = false): Node => ({ id, type: "party", position: { x, y }, data: { title, subtitle, highlight }, draggable: false });

export function Architecture({ mode, step, animatedEvent }: { mode: Mode; step: number; animatedEvent: WireEvent | null }) {
  const [pulse, setPulse] = useState(false);
  useEffect(() => {
    if (!animatedEvent) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const start = window.setTimeout(() => setPulse(true), 0);
    const end = window.setTimeout(() => setPulse(false), 900);
    return () => { window.clearTimeout(start); window.clearTimeout(end); };
  }, [animatedEvent]);
  const nodes = useMemo<Node[]>(() => {
    const common = [
      party("issuer", "Issuer treasury", "requests and approvals", 0, 30, animatedEvent?.actor === "issuer"),
      party("fund", "Fund operations", "redemption processing", 190, 30, animatedEvent?.actor === "fund"),
      party("bank", "Bank", "cash confirmations", 380, 30, animatedEvent?.actor === "bank"),
      party("customers", "Customer payouts", "simulated destination", 570, 30),
    ];
    return [...common, party(mode === "ledger" ? "ledger" : "reconcile",
      mode === "ledger" ? "Shared workflow ledger" : "Reconciliation service",
      mode === "ledger" ? "simulated linked events" : "separate records aligned", 285, 200, mode === "ledger" && pulse)];
  }, [mode, animatedEvent, pulse]);
  const edges = useMemo<Edge[]>(() => {
    const message = (id: string, source: string, target: string, label: string, active = false): Edge => ({
      id, source, target, label, animated: active, type: "smoothstep", markerEnd: { type: MarkerType.ArrowClosed },
      style: { stroke: "var(--muted-foreground)", strokeWidth: 1.5, strokeDasharray: "5 5" },
      labelStyle: { fill: "var(--foreground)", fontSize: 11 }, labelBgStyle: { fill: "var(--background)" },
    });
    const cash = (id: string, source: string, target: string, label: string, active = false): Edge => ({
      id, source, target, label, animated: active, type: "smoothstep", markerEnd: { type: MarkerType.ArrowClosed },
      style: { stroke: "var(--primary)", strokeWidth: active ? 3 : 2 },
      labelStyle: { fill: "var(--foreground)", fontSize: 11, fontWeight: 600 }, labelBgStyle: { fill: "var(--background)" },
    });
    const type = animatedEvent?.type;
    const result: Edge[] = [
      message("request", "issuer", "fund", "", pulse && ["request_redemption", "accept_redemption"].includes(type ?? "")),
    ];
    if (step >= 4) result.push(cash("proceeds", "fund", "bank", "$200m cash", pulse && type === "confirm_proceeds"));
    if (step >= 5) result.push(message("instruction", "issuer", "bank", "payout instruction", pulse && type === "approve_payouts"));
    if (step >= 6) result.push(cash("payout", "bank", "customers", "$450m paid", pulse && type === "confirm_payouts"));
    if (mode === "ledger") result.push(message("record", "fund", "ledger", "workflow events", pulse));
    else result.push(message("reconcile-edge", "fund", "reconcile", "record matching", false));
    return result;
  }, [mode, step, animatedEvent, pulse]);
  return <div className="h-[300px] min-h-[300px] w-full" role="group" aria-label={mode === "ledger" ? "Issuer, fund, bank and customers with a simulated shared workflow ledger. Cash moves only between financial parties." : "Issuer, fund, bank and customers with separate records and reconciliation."}>
    <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView fitViewOptions={{ padding: 0.12 }} nodesDraggable={false} nodesConnectable={false} elementsSelectable={false} panOnDrag={false} zoomOnScroll={false} zoomOnPinch={false} preventScrolling={false}>
      <Background color="var(--border)" gap={28} size={1} />
    </ReactFlow>
  </div>;
}
