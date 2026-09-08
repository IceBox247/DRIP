# Frontend — web + mobile app (Phase 2)

User-facing app for the Drip mining node (SPEC §6).

## Screens / features

- **Node dashboard** — start/stop the mining node (server-side accrual timer — **not** real
  mining), show live status.
- **Hash rate** — current hash rate and its breakdown (base + holdings + task boosts + referral
  boosts; SPEC §2.2).
- **Claimable stock** — this cycle's accrued points and claimable Stock Token allocation; claim via
  Merkle proof from `RewardVault` (SPEC §2.4).
- **Referral** — the user's unique referral link; referred users must connect X to attribute the
  referral (SPEC §4).
- **Task list** — social/engagement tasks (retweet, comment, follow) that grant hash-rate boosts
  (SPEC §5).
- **Auth** — wallet connect + X OAuth (SPEC §6).

## Compliance (see docs/BLOCKERS.md)

- **US-person geoblock** at the edge and in-app. Gate access for blocked jurisdictions.
- No yield/return/investment promises in copy. Present rewards factually, not as an expectation of
  profit.
- Referral copy must avoid recruitment/Ponzi framing.

## Not yet chosen

Web framework, mobile approach (native vs. cross-platform), and wallet-connect library are open.
Document choices here when made.
