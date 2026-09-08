# Keeper — reward-cycle automation (Phase 3)

Contracts can't self-trigger. An external keeper (**Gelato** or **Chainlink Automation**) drives the
hourly reward cycle (SPEC §3, §6).

## Each cycle (default: hourly — `config/constants.json` cycle.durationSeconds)

1. **Auto-buy** — swap the 2% buffer held by `FeeRouter` into the target Stock Token(s). Swaps must
   be **slippage-bounded** (SPEC §3, DECISIONS.md #3 for which token).
2. **Split** — call `ReserveManager.processCycle(acquired)`: 50% → reserve, 50% → distribution,
   plus dynamic drawdown on low-volume cycles.
3. **Publish** — the backend computes per-user allocations from that cycle's points and publishes
   the Merkle root to `RewardVault`. (This step is off-chain-triggered; the keeper handles the
   on-chain swap/split, the backend handles the root — keep the boundary explicit.)

## Design constraints

- **Permissionless-safe entrypoints.** A keeper outage must not be exploitable and anyone should be
  able to poke a due cycle: make the on-chain cycle call **idempotent per cycle** (no double-spend
  if called twice), slippage-bounded, and free of trust in the caller (ARCHITECTURE.md).
- **Missed cycles.** Decide catch-up behavior (process one cycle per call vs. fold missed volume in)
  and document it before Phase 3 implementation.

## Not yet chosen

Gelato vs. Chainlink Automation. Pick based on Robinhood Chain support and cost; document here.
