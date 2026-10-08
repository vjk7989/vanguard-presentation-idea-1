# Walkthroughs

## Main flow

1. Enter the public admin dashboard and choose **Show QR**. Scan with issuer, fund, and bank phones. Watch the waiting-device count rise before roles are picked; refresh retains each claimed role. A participant can change roles. The admin may kick an assigned or waiting device; it can rejoin with the QR code or Rejoin button.
2. Start. Ask Issuer to open a $10m **Practice coordination** request. Fund reviews and forwards a status request, then Bank acknowledges to Issuer. The projector shows each accepted message. Open ten cases in succession if desired, up to 20 per run. These display amounts never move cash. Separately, open and approve a fictional **Sample desk item**; its status changes without changing Friday balances.
3. Issuer requests $150m; Fund accepts it. Cash remains $300m.
4. Fund processes redemption. Holdings become $1.55bn and pending proceeds $150m. Bank cash remains $300m.
5. Bank confirms receipt. Pending becomes zero and bank cash becomes $450m.
6. Issuer approves $450m payouts. Approval does not move cash.
7. Bank confirms payouts. Cash becomes $0; obligations become $1.55bn. Review results and event-by-event replay, including practice cases and background items. The older $200m/$50m-buffer version-one run stays available unchanged.

## Delayed confirmation

After step 3, choose **Delay bank**. The bank confirmation action is unavailable; $150m remains pending. The issuer cannot approve payouts with only $300m available. Choose **Release bank delay**, then have the bank confirm the receipt. The presenter shows bank verification as pending, not confirmed 1:1 backing.

## Repeated bank notice

After step 4, choose **Repeat bank notice**. The event timeline records a duplicate notice with the original `DEMO-BANK` reference. Cash stays $450m. Open the event drawer to inspect its simulated reference and hash link.

## Comparison and recovery

Switch between **Without blockchain** and **With blockchain** at any step. The former shows separate illustrative party records and matching; the latter presents those same accepted events as one hash-linked simulated workflow history. Balances and timing remain the same. Disconnect a participant briefly, reconnect, and check the authoritative state. Restart to create a new version-two run with the same roles and empty practice cases. The prior run is read-only in Results and replay; a late action carrying its run ID is rejected.
