# Walkthroughs

## Main flow

1. Open the shared control room and connect issuer, fund, and bank phones with the QR code. Confirm that refresh retains each role. The presenter may kick a participant; they can rejoin with the QR code or Rejoin button.
2. Start. Issuer requests $200m; fund accepts it. Cash remains $300m.
3. Fund processes redemption. Holdings become $1.5bn and pending proceeds $200m. Bank cash remains $300m.
4. Bank confirms receipt. Pending becomes zero and bank cash becomes $500m.
5. Issuer approves $450m payouts. Approval does not move cash.
6. Bank confirms payouts. Cash becomes $50m; obligations become $1.55bn. Review results and replay.

## Delayed confirmation

After step 3, choose **Delay bank**. The bank confirmation action is unavailable; $200m remains pending. The issuer cannot approve payouts with only $300m available. Choose **Release bank delay**, then have the bank confirm the receipt.

## Repeated bank notice

After step 4, choose **Repeat bank notice**. The event timeline records a duplicate notice with the original `DEMO-BANK` reference. Cash stays $500m. Open the event drawer to inspect its simulated reference and hash link.

## Comparison and recovery

Switch between **Without blockchain** and **With blockchain** at any step. Balances and history remain the same. Disconnect a participant briefly, reconnect, and check the authoritative state. Restart to create a new run with the same roles. The prior run is read-only in Results and replay; a late action carrying its run ID is rejected.
