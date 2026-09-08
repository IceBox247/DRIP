# Keeper — reward-cycle automation (Phase 3)

Contracts can't self-trigger. An external keeper (**Gelato** or **Chainlink Automation**) drives the
hourly reward cycle (SPEC §3, §6). The keeper is also where the **launchpad fee integration** lives.

## Each cycle (default: hourly — `config/constants.json` cycle.durationSeconds)

0. **Receive fee** — the launchpad collects the 4% on trades; the keeper gets our share via the
   **fee-source adapter** (`config/constants.json` feeSource):
   - *push mode*: read the balance the launchpad credited to our fee wallet.
   - *pull mode*: call the launchpad's withdraw/claim entrypoint (needs rights/keys) to move fees
     into our fee wallet.
   This is the **launchpad-specific** part — keep it isolated here so everything downstream stays
   launchpad-agnostic (DECISIONS.md #5, BLOCKERS.md #3).
1. **Distribute** — split the received fee → 2% auto-buy buffer, 1% marketing/ops, (1% launchpad
   only if we received the gross 4%). Via `FeeDistributor.distribute()` on-chain, or directly here.
2. **Auto-buy** — swap the 2% buffer into the target Stock Token(s). Swaps must be
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
- **Isolate privileged fee access.** *Pull-mode* fee withdrawal may need keys/rights on the
  launchpad wallet — the one privileged step. Keep it in a single module, secure the key, and make
  everything after fee receipt permissionless. *Push mode* needs no keys (just read the wallet).
- **Missed cycles.** Decide catch-up behavior (process one cycle per call vs. fold missed volume in)
  and document it before Phase 3 implementation.

## Not yet chosen

Gelato vs. Chainlink Automation. Pick based on Robinhood Chain support and cost; document here.
