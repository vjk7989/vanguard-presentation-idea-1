# Product1.md — Interactive Issuer Reserve Demo

## 1. Purpose

Build a professional website for **Idea One: issuer reserve operations**.

The presenter and audience act as the issuer, fund operator and bank operator. An animated dashboard shows their actions and the resulting balances.

The demo explains:

- Why an accepted fund request is different from available bank cash.
- Who approves and completes each action.
- How participants track pending and completed transactions.
- How a proposed shared ledger differs from connected conventional systems.

Build Product One first. Reuse its room, role and dashboard components for the other three products later.

Every screen must display:

> Simulation — fictional participants, balances and transactions. No real bank connection or money movement.

Use short sentences and consistent terms based on ASD-STE100 guidance.

## 2. Devices and role assignment

### Four-device setup

| Device | Role | Available actions |
|---|---|---|
| Presenter’s laptop | Presenter | Dashboard, scenario controls, comparison switch, takeover and reset |
| Presenter’s phone | Issuer treasury | Request fund cash and approve customer payouts |
| Audience device one | Fund operations | Accept and process the fund redemption |
| Audience device two | Bank operations | Confirm incoming cash and completed customer payouts |

Fund operations represents an appointed fund service provider. Vanguard remains the proposed investment manager.

### QR joining

1. The presenter creates a room.
2. The laptop displays a QR code and six-character room code.
3. Participants scan the QR code or enter the room code.
4. Each participant selects an available role.
5. The first successful server-side claim receives that role.
6. Other participants immediately see that role as occupied.
7. The presenter starts the scenario.

Use an atomic database operation for role claims. If two people select the same role, only one succeeds.

The other participant sees:

> This role was just taken. Choose another role.

No participant account, email address or wallet installation is required.

Assign a **demo wallet ID** to each role. These are simulated identities, not real cryptocurrency wallets.

A page refresh restores the participant’s role. A temporary disconnect does not release it. The presenter can release or reassign a role.

When all roles are occupied, show “All roles are taken.”

The presenter can perform any participant action from the laptop. Label these events as actions performed by the presenter on behalf of that role.

## 3. Screens and design

### Screen A — Presenter setup

Display:

- **Reserve Operations Lab** title.
- A brief explanation of the demo.
- “Create demo room.”
- Scenario selection.
- A short presentation guide.

Protect room creation with a presenter access code configured on the server. Do not include this code in participant links.

### Screen B — Lobby

Display:

- Large QR code.
- Room code.
- Three role positions.
- Available, connected and disconnected status.
- Start button.
- Presenter takeover controls.

Keep a smaller join control available during the demonstration.

### Screen C — Presenter dashboard

**Top toolbar**

- Room and connection status.
- Scenario name.
- “Without blockchain” / “With blockchain” switch.
- Pause, restart and end-room controls.

**Balance strip**

Show:

- Available bank cash.
- Fund holdings.
- Pending fund proceeds.
- Issuer obligations.
- Required cash buffer.

Use compact labelled figures. Avoid oversized promotional metric cards.

**Main architecture canvas**

Show:

1. Issuer treasury.
2. Fund operations.
3. Bank.
4. Customer payouts.
5. Proposed shared workflow ledger, visible in blockchain mode.

Customer payouts are a simulated destination, not another participant role.

**Current-step panel**

Show:

- What just happened.
- Who acts next.
- What remains unresolved.
- Why an action is unavailable.

**Event timeline**

Show actor, action, amount and result.

Selecting an event opens a detail drawer with its reference, source, timestamp and related events. Keep technical details collapsed by default.

### Screen D — Participant screen

Design for phones:

- Persistent role name.
- Demo wallet ID.
- One clear current task.
- Relevant amount and balances.
- One primary action at a time.
- Waiting, connection and error states.
- A short activity history.

Do not show presenter controls.

### Screen E — Results and replay

Display:

- Opening and closing balances.
- Completed steps.
- Exceptions encountered.
- Replay button.
- Restart button that retains roles.
- What the demonstration establishes.
- What still requires validation.

Do not display invented savings or blockchain performance figures.

### Design system and theme

Use **shadcn/ui** with this exact theme command:

```bash
npx shadcn@latest add https://tweakcn.com/r/themes/cmuzuxuw7000004l5gdabbg1m
```

The verified theme is named **“red vanguard.”**

Its supplied tokens include:

- Red primary color in light mode.
- Purple primary color in dark mode.
- Neutral backgrounds.
- Plus Jakarta Sans.
- IBM Plex Mono.
- Rounded surfaces and defined shadows.

Preserve the theme’s light and dark palettes. Do not retain orange styling from the previous theme.

Use light mode by default for meeting-room presentation. Offer dark mode as a preference.

Use Plus Jakarta Sans for interface text and IBM Plex Mono for technical references. Do not use the serif font for operational controls.

Reuse shadcn buttons, dialogs, sheets, tooltips, tabs and alerts.

Distinguish primary actions from errors with labels, icons and context. Red alone must not communicate failure.

Use the Taste skill if available in the implementation environment. Otherwise, use the available Impeccable product-design guidance.

The visual style must be restrained and professional:

- Clear hierarchy and generous spacing.
- One dominant architecture canvas.
- Consistent controls.
- Subtle borders and shadows.
- No decorative gradients or background particles.
- No excessive card grids.
- No simulated “hacker terminal” styling.

Check text contrast and touch targets. Correct inaccessible token combinations while preserving the theme’s identity. Support keyboard access and reduced motion.

## 4. Financial scenario and comparison modes

### Main scenario — Friday customer redemptions

Harbor Dollar is a fictional stablecoin issuer. Customers request bank money in exchange for their tokens.

| Opening item | Amount |
|---|---:|
| Issuer obligations | $2 billion |
| Available bank cash | $300 million |
| Assumed eligible reserve-fund holdings | $1.7 billion |
| Planned customer payouts | $450 million |
| Required closing cash buffer | $50 million |
| Required fund redemption | $200 million |

Fund eligibility and availability are assumptions. Do not describe this as an existing Vanguard product or mandate.

### Transaction sequence

| Step | Action | Result |
|---|---|---|
| 1 | Issuer requests $200m | Cash and fund holdings remain unchanged |
| 2 | Fund operator accepts | Request is accepted; cash remains $300m |
| 3 | Fund operator processes redemption | Fund holdings become $1.5bn; pending proceeds become $200m |
| 4 | Bank confirms incoming cash | Pending proceeds become zero; cash becomes $500m |
| 5 | Issuer approves $450m payouts | Instruction is approved; cash remains unchanged |
| 6 | Bank confirms completed payouts | Cash becomes $50m; obligations become $1.55bn |

The final step includes the corresponding effective reduction in issuer obligations.

Closing assets:

> $1.5 billion in fund holdings + $50 million cash = $1.55 billion.

Exclude fees, market changes and unrelated movements.

Never count the same proceeds as fund holdings, pending cash and received cash simultaneously.

### Comparison switch: same event, two views

Switching mode must preserve:

- Participants and roles.
- Balances.
- Transaction progress.
- Event history.
- Bank confirmation status.

Only the architecture presentation and explanation change.

**Without blockchain**

Show separate issuer, fund and bank records connected through APIs. Include a conventional reconciliation service.

Explain that standard systems can provide approvals, duplicate checks, signed records and workflow automation.

**With blockchain**

Show the proposed shared workflow ledger. Authorized participants publish and acknowledge linked events through that shared layer.

Banks and fund providers remain authoritative for their own records.

Money must not appear to flow through the ledger. The ledger records workflow events; it does not hold the issuer’s bank cash.

Display:

> Same transaction and controls. Different record-sharing design.

Do not make conventional mode artificially slow or unreliable. Do not make blockchain mode create faster bank settlement.

The proposed difference is shared history and agreed state across firms. Its commercial value remains a question for a measured pilot.

### Animation behavior

Use three visual patterns:

- Dashed path: instruction or status message.
- Solid labelled path: confirmed simulated cash movement.
- Short pulse: event recorded in the shared ledger.

Trigger animations only after the server accepts the event.

Examples:

- Issuer → fund operations: redemption request.
- Fund operations → issuer: request accepted.
- Fund-side cash source → issuer bank account: confirmed proceeds.
- Issuer bank account → customers: completed payouts.
- Relevant actor → shared ledger: workflow event.

Use approximately 150–250 ms for interface transitions and 700–1,000 ms for transaction-path animations.

Animations illustrate events. Their completion must not change balances or determine settlement.

### Exception scenario — delayed bank confirmation

The presenter activates “Delay bank confirmation.”

- Fund processing completes.
- Pending proceeds show $200m.
- Available cash remains $300m.
- The planned payout requires $500m, including the required buffer.
- The payout action remains unavailable.
- The bank later confirms receipt.
- Available cash increases to $500m.

Explain that the issuer would need its approved contingency process in a real delayed-payment case.

### Exception scenario — repeated bank message

After receipt, the presenter activates “Repeat bank confirmation.”

- The original bank reference arrives again.
- The system records a repeated-message notice.
- Cash remains $500m.
- The event drawer explains why no new cash movement occurred.

Both comparison modes must handle this correctly.

## 5. Technical implementation and recovery

### Stack

Use:

- Next.js App Router and TypeScript.
- Tailwind CSS and shadcn/ui.
- The supplied tweakcn theme.
- React Flow for the architecture canvas.
- Motion for transitions.
- A browser QR-code component.
- Vercel for application hosting.
- Neon Postgres for shared room state.

Use one-second polling while screens are visible. Fetch immediately after actions and when a screen regains focus.

Show connection status and last synchronization time. This is a near-live demo, not a blockchain latency benchmark.

### Shared state and interfaces

Store:

- Room and selected scenario.
- Current run and revision.
- Participant sessions and role assignments.
- Financial state.
- Ordered event history.
- Presenter controls and comparison mode.

Use integer minor units for financial calculations. Format amounts as millions and billions in the interface.

Provide server operations for:

- Room creation and joining.
- Role claims and release.
- Reading current state and new events.
- Role actions.
- Comparison switching.
- Pause, resume and reset.
- Exception injection.
- Ending a room.

Validate role permissions on the server. Participants must not be able to submit arbitrary balance changes.

Each action must include a unique request reference and current run identifier. Update financial state and event history within one database transaction.

Repeated requests must not repeat financial effects.

### Recovery rules

- Use secure session cookies.
- Keep database credentials and presenter configuration server-side.
- Preserve role assignments during temporary disconnections.
- Allow only the presenter to change scenarios or reset.
- Pause blocks new scenario actions but allows status checks.
- Reset starts a new run with opening balances and the same roles.
- Reject late actions from an earlier run.
- Retain earlier runs for replay until room expiry.
- Expire rooms after 24 hours and remove expired demo data.
- On reconnect, retrieve authoritative state and missed events.
- Do not replay every historical animation after reconnect.
- On network failure, disable transaction actions and show the last confirmed state.
- Do not silently create independent local simulations on different devices.

Presenter takeover handles absent participants. It does not provide offline operation.

## 6. Acceptance tests and handoff

### Functional tests

Verify:

1. Four browser sessions can use the same room.
2. Simultaneous role claims produce one winner.
3. Refresh restores the participant’s role.
4. Server permissions prevent cross-role actions.
5. The main scenario produces the stated closing balances.
6. Acceptance and processing do not increase available cash.
7. Delayed confirmation keeps proceeds pending.
8. Duplicate requests and messages do not duplicate money.
9. Mode switching preserves all financial state.
10. Reset rejects actions from the previous run.
11. Presenter takeover works for every role.
12. Reconnection restores correct state.

### Visual tests

Check:

- Laptop layout at 1366 × 768 and larger.
- Phone layouts at 360–430 px widths.
- Actual QR scanning.
- Diagram labels without overlap.
- Legible theme colors in both modes.
- Clear loading, waiting, disabled and error states.
- Keyboard access and reduced motion.

Target cross-device updates within two seconds on a stable test connection. Report actual results.

### Implementation handoff

Deliver:

- `Product1.md`.
- Application source.
- Setup and deployment instructions.
- A three-minute presenter script.
- Main-flow and exception walkthroughs.
- Test results and screenshots.
- Hosted URL and participant QR entry point after deployment.

Close the presenter script with:

> This demo shows the proposed workflow and control points. It does not prove that blockchain outperforms conventional automation.

Keep the main deck, appendix and existing idea documents unchanged.
