# Backend — off-chain points engine (Phase 2)

The reward math runs off-chain: millions of per-second micro-updates on-chain would be
unaffordable. The backend owns the **points ledger** and computes each cycle's per-user allocation,
then commits only a **Merkle root** to `RewardVault` (SPEC §6, ARCHITECTURE.md).

## Responsibilities

- **Accounts & auth** — wallet connect + X OAuth (SPEC §6). Link one X account + wallet per user.
- **Node timer** — a server-side accrual timer. **Not real mining.** Points accrue **per-second**
  while a user's node is active, streamed (never snapshot-at-claim), so users can't "hold big right
  before claiming, then dump" (SPEC §2.2).
- **Hash-rate calc** — `BASE_RATE + (drip_held ^ 0.75) * HOLDING_MULTIPLIER + task_boosts +
  referral_boosts` (SPEC §2.2; constants in `config/constants.example.json`). The `0.75` exponent
  is the anti-whale dial.
- **Points ledger** — per-cycle points; reset or decay each cycle so it's a per-cycle *share*, not
  an ever-growing claim (SPEC §2.3).
- **Allocation → Merkle root** — each cycle: `user_stock = distributable * user_points /
  total_points`, build leaves `(account, amount)`, compute root, publish to `RewardVault`
  (SPEC §2.3–2.4).
- **Tasks** — verify social tasks via the X API; apply hash-rate boosts (SPEC §5). *Flag: X API
  access + cost.*
- **Referral graph** — attribute referrals on X-account connect; pay the referrer a 10% override
  that does **not** reduce the referred user's earnings (SPEC §4). Anti-abuse: X account
  age/follower minimums, one referral per unique X-account+wallet pair, sybil detection.

## Compliance (see docs/BLOCKERS.md)

- **US-person geoblocking** must live here + at the edge (IP + connected-account signals).
- No yield/return promises in any API-surfaced copy.
- Keep the points computation **reproducible from public inputs** so published roots are auditable.

## Not yet chosen

Language/framework, datastore, and queue are open. Requirements: fast per-second accrual for many
users, a durable append-only points ledger, and a deterministic cycle job that builds the Merkle
root. Document the choice here when made.
