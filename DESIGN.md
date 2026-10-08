# Reserve Operations Lab — Design System

## Visual thesis

A small group in a bright meeting room uses a presenter laptop and participant phones to coordinate fictional reserve operations. The screen should read as a calm, precise operational workspace from across a room.

## Theme

Use the supplied tweakcn theme `red vanguard` (`cmuzuxuw7000004l5gdabbg1m`) as the source of truth. Preserve its light and dark palettes, Plus Jakarta Sans, IBM Plex Mono, neutral surfaces, rounded controls, and defined shadows. Default to light mode. Red is for primary actions and meaningful state; purple is the dark-mode primary. Correct inaccessible contrast without changing the theme identity.

## Typography

- Plus Jakarta Sans for interface text and operational labels.
- IBM Plex Mono for wallet IDs, references, timestamps, and ledger identifiers.
- Do not use serif text for controls.
- Main body copy is at least 16px; regular labels and controls are at least 14px.

## Layout and components

- Keep presenter setup concise and lead directly to room creation.
- The presenter dashboard has a compact toolbar and balance strip, one dominant architecture canvas, a current-step panel, and an event timeline.
- Participant screens prioritize role, current task, relevant amount, balances, and one primary action.
- Reuse shadcn buttons, dialogs, sheets, tooltips, tabs, switches, alerts, and skeleton states.
- Use restrained borders and shadows; avoid nested and repeated card grids.
- Provide visible focus, loading, disabled, error, waiting, connected, disconnected, and success states.

## Motion

Use 150–250ms for interface changes and 700–1,000ms for accepted transaction path illustrations. Dashed paths represent instructions, solid labelled paths represent confirmed simulated cash movements, and short pulses represent recorded workflow ledger events. Motion never changes financial state. Respect `prefers-reduced-motion`.

## Accessibility and responsive behavior

Support keyboard access, semantic labels, 44px minimum touch targets, responsive laptop and 360–430px phone layouts, and 200% text enlargement. Do not rely on red or green alone to express state.
