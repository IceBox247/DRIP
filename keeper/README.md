# Keeper — reward-cycle automation (Phase 3)

Contracts can't self-trigger. An external keeper (**Gelato** or **Chainlink Automation**) drives the
hourly reward cycle (SPEC §3, §6). The keeper is also where the **Pons fee integration** lives.

## Each cycle (default: hourly — `config/constants.json` cycle.durationSeconds)

0. **Receive fee** — Pons collects the trade fee, keeps its protocol cut, and pays our creator share
   in **USDG**. The keeper gets it via the **fee-source adapter** (`config/constants.json` feeSource):
   - *push mode (Pons default for us)*: read the USDG balance Pons automation credited to our payout
     wallet. No privileged keys.
   - *pull mode (fallback)*: call Pons's claim entrypoint to collect accrued USDG fees, then
     distribute.
   This is the **Pons-specific** part — keep it isolated here so everything downstream stays
   launchpad-agnostic (DECISIONS.md #5, BLOCKERS.md #3).
1. **Distribute** — split the received USDG → ~2/3 auto-buy buffer, ~1/3 marketing/ops. Via
   `FeeDistributor.distribute()` on-chain, or directly here. (No launchpad forwarding — Pons already
   took its cut.)
2. **Auto-buy** — swap the auto-buy USDG into the target Stock Token(s). Swaps must be
   **slippage-bounded** (SPEC §3, DECISIONS.md #3 for which token).
3. **Cycle split** — call `ReserveManager.processCycle(acquired)`: 50% → reserve, 50% →
   distribution, plus dynamic drawdown on low-volume cycles.
4. **Publish** — the backend computes per-user allocations from that cycle's points and publishes
   the Merkle root to `RewardVault`. (This step is off-chain-triggered; the keeper handles the
   on-chain swap/split, the backend handles the root — keep the boundary explicit.)

## Design constraints

- **Permissionless-safe entrypoints.** A keeper outage must not be exploitable and anyone should be
  able to poke a due cycle: make the on-chain cycle call **idempotent per cycle** (no double-spend
  if called twice), slippage-bounded, and free of trust in the caller (ARCHITECTURE.md).
- **Isolate fee access.** With Pons **push** automation the keeper just reads the USDG payout wallet —
  no keys. Only the **pull-mode** fallback (calling Pons's claim entrypoint) needs claim rights; if
  used, keep it in one module, secure the key, and make everything after fee receipt permissionless.
- **Note on cadence.** Pons runs a per-token vault (~every 5 min) that processes fee claims. Our
  reward cycle is hourly — the keeper batches whatever USDG has accrued since the last cycle.
- **Missed cycles.** Decide catch-up behavior (process one cycle per call vs. fold missed volume in)
  and document it before Phase 3 implementation.

## Not yet chosen

Gelato vs. Chainlink Automation. Pick based on Robinhood Chain support and cost; document here.
