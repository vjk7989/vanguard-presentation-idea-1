"use client";

import { useMemo } from "react";
import { ArrowDown, ArrowRight, Radio, Users } from "lucide-react";
import type { IdeaAction, IdeaSpec } from "@/lib/ideas/types";

type Device = { id: string; role: string | null; connected: boolean };
type RolePresence = { role: string; claimed: boolean; connected: boolean };
type Event = { id: string; type: string; label: string; hash: string; actor: string; index: number };
type Props = {
  spec: IdeaSpec;
  state: Record<string, unknown>;
  roles: RolePresence[];
  devices: Device[];
  animatedEvent: { type: string; label: string; route?: { source: string; target: string; kind: IdeaAction["pathKind"] } | null } | null;
  events: Event[];
};

// The pure scenario transitions let the projector discover routes without a
// second, hand-maintained diagram for each idea. The bounded walk is cached.
const routeCache = new Map<number, IdeaAction[]>();
function routesFor(spec: IdeaSpec): IdeaAction[] {
  const cached = routeCache.get(spec.id);
  if (cached) return cached;
  const queue: Record<string, unknown>[] = [spec.initialState()];
  const visited = new Set<string>();
  const routes = new Map<string, IdeaAction>();
  for (let cursor = 0; cursor < queue.length && cursor < 800; cursor++) {
    const state = queue[cursor];
    const signature = JSON.stringify(state);
    if (visited.has(signature)) continue;
    visited.add(signature);
    for (const action of spec.actions(state)) {
      routes.set(action.id, action);
      try {
        const next = spec.transition(state, action.id).state;
        if (!visited.has(JSON.stringify(next))) queue.push(next);
      } catch {
        // A scenario may intentionally reject a branch. Only accepted paths
        // belong in the diagram.
      }
    }
  }
  const result = [...routes.values()];
  routeCache.set(spec.id, result);
  return result;
}

function displayStage(value: unknown): string {
  if (typeof value !== "string" || !value) return "Waiting for the first action";
  return value.replaceAll("_", " ").replace(/\b\w/g, letter => letter.toUpperCase());
}

export function ScenarioArchitecture({ spec, state, roles, devices, animatedEvent, events }: Props) {
  const allRoutes = useMemo(() => routesFor(spec), [spec]);
  const activeRoute = animatedEvent?.route
    ? { id: animatedEvent.type, role: animatedEvent.route.source, label: animatedEvent.label, detail: "", source: animatedEvent.route.source, target: animatedEvent.route.target, pathKind: animatedEvent.route.kind }
    : animatedEvent ? allRoutes.find(route => route.id === animatedEvent.type) ?? null : null;
  const roleById = useMemo(() => new Map(spec.roles.map(role => [role.id, role])), [spec.roles]);
  const waiting = devices.filter(device => device.connected && !device.role);
  const claimed = roles.filter(role => role.claimed).length;
  const participantsOnline = devices.filter(device => device.connected).length;
  const current = spec.actions(state);
  const extraNodeIds = [...new Set([...allRoutes, ...(activeRoute ? [activeRoute] : [])].flatMap(route => [route.source, route.target]))].filter(id => !roleById.has(id));
  const nodeIds = [...spec.roles.map(role => role.id), ...extraNodeIds];
  const visibleRoutes = (() => {
    const seen = new Set<string>();
    return [...allRoutes, ...(activeRoute ? [activeRoute] : [])].filter(route => {
      const key = `${route.source}:${route.target}:${route.pathKind}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  })();
  const latestEvent = events.at(-1);
  const animationKey = animatedEvent ? `${latestEvent?.id ?? animatedEvent.type}-${animatedEvent.type}` : "idle";
  const positions = new Map(nodeIds.map((id, index) => [id, ((index + 0.5) / nodeIds.length) * 1000]));
  const diagramHeight = Math.max(132, 42 + visibleRoutes.length * 20);

  const roleName = (id: string) => roleById.get(id)?.title ?? (id.includes("authority") ? "Simulated tax authority" : displayStage(id));
  const node = (id: string) => {
    const role = roleById.get(id);
    if (!role) return <div key={id} className="min-w-0 rounded-xl border border-dashed border-border bg-muted/40 p-3 sm:p-4"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary"><Users size={17} aria-hidden="true" /></span><h3 className="mt-3 text-sm font-bold text-foreground">{roleName(id)}</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">Presenter-operated fictional service</p><p className="mt-3 border-t border-border pt-2 text-xs font-semibold text-muted-foreground">No participant device</p></div>;
    const presence = roles.find(item => item.role === id);
    const device = devices.find(item => item.role === id);
    const highlighted = activeRoute?.source === id || activeRoute?.target === id;
    const status = device?.connected ? "Device online" : presence?.claimed ? "Device offline" : "Role open";
    return <div key={id} className={`min-w-0 rounded-xl border bg-card p-3 shadow-sm transition-[border-color,box-shadow] duration-200 sm:p-4 ${highlighted ? "border-primary shadow-md" : "border-border"}`}>
      <div className="flex items-start justify-between gap-2">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary text-foreground"><Radio size={17} aria-hidden="true" /></span>
        <span className={`rounded-full px-2 py-1 text-xs font-semibold ${device?.connected ? "bg-emerald-100 text-emerald-950 dark:bg-emerald-900/50 dark:text-emerald-100" : "bg-muted text-foreground"}`}>{status}</span>
      </div>
      <h3 className="mt-3 text-sm font-bold leading-5 text-foreground">{role.title}</h3>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{role.organization}</p>
      <p className="mt-3 border-t border-border pt-2 font-mono text-xs text-muted-foreground">{device ? `Device ${device.id.slice(0, 6)} · ${device.connected ? "online" : "offline"}` : presence?.claimed ? "Device offline" : "Presenter can act"}</p>
    </div>;
  };

  return <section className="space-y-5 p-4 sm:p-6" aria-label={`${spec.title} live workflow`}>
    <style>{`@keyframes scenario-path { from { stroke-dashoffset: 56; opacity: .36; } to { stroke-dashoffset: 0; opacity: 1; } }
      @keyframes scenario-pulse { 0% { opacity: .2; transform: scale(.82); } 60% { opacity: 1; transform: scale(1.18); } 100% { opacity: 1; transform: scale(1); } }
      .scenario-path-active { animation: scenario-path 850ms cubic-bezier(.16,1,.3,1) both; }
      .scenario-ledger-pulse { animation: scenario-pulse 700ms cubic-bezier(.16,1,.3,1) both; }
      @media (prefers-reduced-motion: reduce) { .scenario-path-active, .scenario-ledger-pulse { animation: none !important; } }`}</style>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0"><h2 className="text-lg font-bold text-foreground">{spec.title} · live coordination</h2><p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">{spec.summary}</p></div>
      <div className="flex shrink-0 items-center gap-2 rounded-full bg-secondary px-3 py-2 text-xs font-semibold text-foreground"><Users size={15} aria-hidden="true" />{claimed} roles claimed · {participantsOnline} participants online · {waiting.length} choosing</div>
    </div>

    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-medium text-muted-foreground" aria-label="Path legend">
      <span>┄ Request or evidence</span><span className="text-primary">━━ Confirmed simulated asset or payment</span><span>Stage: {displayStage(state.stage)}</span>
    </div>

    {animatedEvent && <div key={animationKey} className="flex items-start gap-3 rounded-xl border border-primary/40 bg-primary/5 px-4 py-3 text-sm text-foreground" role="status" aria-live="polite">
      <span className="scenario-ledger-pulse mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"><ArrowRight size={15} aria-hidden="true" /></span>
      <p><strong>Accepted now:</strong> {activeRoute ? `${roleName(activeRoute.source)} → ${roleName(activeRoute.target)} · ` : "Workflow activity · "}{animatedEvent.label}</p>
    </div>}

    <div className="hidden lg:block" role="img" aria-label={`${nodeIds.map(roleName).join(", ")} connected by labelled scenario routes`}>
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${nodeIds.length}, minmax(0, 1fr))` }}>{nodeIds.map(node)}</div>
      <svg className="mt-1 h-auto w-full overflow-visible" viewBox={`0 0 1000 ${diagramHeight}`} aria-hidden="true">
        {visibleRoutes.map((route, index) => {
          const from = positions.get(route.source);
          const to = positions.get(route.target);
          if (from === undefined || to === undefined) return null;
          const bend = 39 + index * 19;
          const active = activeRoute?.source === route.source && activeRoute?.target === route.target && activeRoute?.pathKind === route.pathKind;
          return <g key={`${route.source}-${route.target}-${route.pathKind}`}>
            <path key={active ? animationKey : "static"} d={`M ${from} 4 C ${from} ${bend}, ${to} ${bend}, ${to} 4`} fill="none" stroke="currentColor" strokeWidth={active ? 3 : 1.5} strokeDasharray={route.pathKind === "confirmed" ? undefined : "7 6"} className={`${active ? "scenario-path-active text-primary" : "text-muted-foreground/60"}`} />
            <circle cx={to} cy="4" r={active ? 5 : 3} className={active ? "fill-primary" : "fill-muted-foreground"} />
          </g>;
        })}
      </svg>
      <ul className="flex flex-wrap gap-2 text-xs text-muted-foreground" aria-label="Workflow routes">{visibleRoutes.map(route => <li key={route.id} className={`rounded-full border px-2.5 py-1.5 ${activeRoute?.source === route.source && activeRoute?.target === route.target && activeRoute?.pathKind === route.pathKind ? "border-primary text-foreground" : "border-border"}`}>{roleName(route.source)} → {roleName(route.target)}</li>)}</ul>
    </div>

    <div className="space-y-1 lg:hidden" aria-label="Vertical workflow">
      {nodeIds.map((id, index) => <div key={id}>{node(id)}{index < nodeIds.length - 1 && <div className="flex h-7 items-center gap-2 pl-6 text-xs text-muted-foreground"><span className="h-5 border-l-2 border-dashed border-muted-foreground" /><ArrowDown size={14} aria-hidden="true" /><span>Connected desk</span></div>}</div>)}
      {activeRoute && <p className="rounded-lg bg-secondary px-3 py-2 text-sm text-foreground">Current route: {roleName(activeRoute.source)} → {roleName(activeRoute.target)}</p>}
      <ul className="space-y-1 pt-2" aria-label="Scenario message routes">{visibleRoutes.map(route => <li key={route.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border py-2 text-xs text-foreground"><span>{roleName(route.source)} → {roleName(route.target)}</span><span className="font-semibold text-muted-foreground">{route.pathKind === "confirmed" ? "Confirmed" : route.pathKind === "evidence" ? "Evidence" : "Request"}</span></li>)}</ul>
    </div>

    {waiting.length > 0 && <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3 text-xs text-muted-foreground"><span className="font-semibold text-foreground">Joining area</span>{waiting.map(device => <span key={device.id} className="rounded-full bg-secondary px-2.5 py-1 font-mono">Device {device.id.slice(0, 6)}</span>)}</div>}
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4 text-sm"><span className="font-semibold text-foreground">{current.length ? `${current.length} action${current.length === 1 ? "" : "s"} ready across the desks` : "No further guided action is ready"}</span><span className="text-xs text-muted-foreground">Only accepted clicks enter the live record.</span></div>

    <div className="border-t border-border pt-4"><h3 className="text-sm font-semibold text-foreground">Live button log</h3><ol className="mt-2 max-h-48 space-y-1 overflow-y-auto" aria-live="polite">{events.slice(-8).reverse().map(event => <li key={event.id} className="flex flex-wrap justify-between gap-x-3 gap-y-1 border-b border-border/60 py-2 text-xs"><span className="min-w-0 text-foreground">{event.label}</span><span className="shrink-0 font-mono text-muted-foreground">#{event.index} · {roleName(event.actor)}</span></li>)}{events.length === 0 && <li className="py-2 text-xs text-muted-foreground">Waiting for a participant action.</li>}</ol></div>
  </section>;
}
