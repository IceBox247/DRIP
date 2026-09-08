# Drip ($DRIP)

A **fair-launch ERC-20** on **Robinhood Chain** whose **4% trade fee** funds a **tokenized-stock
reward pool**. The team holds no tokens. Users run an in-app "mining node" (a server-side accrual
timer — **not** real mining) and earn *hash rate* from their DRIP holdings plus task and referral
boosts; hash rate accrues points, and points entitle users to claim real Stock Tokens bought by the
fee engine.

> **The full specification is the source of truth:** [`docs/SPEC.md`](./docs/SPEC.md).

---

## ⚠️ Read before building

This project sits on top of two hard gates. See [`docs/BLOCKERS.md`](./docs/BLOCKERS.md):

1. **Stock Token transferability** — the reward payout depends on sending Stock Tokens to arbitrary
   wallets. These were whitelist-gated. **Verify freely transferable on-chain before building the
   claim layer.**
2. **Legal / securities exposure** — a bought token + a reward promise looks like an investment
   contract; Stock Tokens are blocked for US persons. **This repo is not legal advice.** Get counsel,
   structure offshore, geoblock US **before launch.**

Nothing here should be deployed to mainnet or promoted publicly until both gates clear.

---

## Repository layout

```
docs/          Canonical spec and planning docs (start here)
  SPEC.md          Full build specification (source of truth)
  ARCHITECTURE.md  Component → repo mapping, data flow, on/off-chain boundary
  ROADMAP.md       Phased build order (§9)
  DECISIONS.md     Open decisions to resolve before Phase 1 (§7)
  BLOCKERS.md      Hard gates that can invalidate the design (§8)
config/        Tunable constants (constants.example.json — §10)
contracts/     Solidity (Foundry) — DripToken, FeeRouter, hook, ReserveManager, RewardVault
backend/       Off-chain points engine + auth (Phase 2)
keeper/        Automation that triggers the hourly reward cycle (Phase 3)
frontend/      Web + mobile app (Phase 2)
```

Each subdirectory has its own README describing what belongs there and its build phase.

## Current status

**Phase 0.** This commit establishes the specification, planning docs, and a scaffold of the
architecture. Contract, backend, keeper, and frontend directories currently hold **skeletons and
interfaces** with TODOs referencing the spec — not production implementations. Implementation
follows the phased [roadmap](./docs/ROADMAP.md) once the [open decisions](./docs/DECISIONS.md) are
resolved and the [blockers](./docs/BLOCKERS.md) are cleared.

## Chain

Robinhood Chain — mainnet chain ID **4663**, testnet **46630**. EVM, Arbitrum Orbit stack. All
Phase 1–3 development targets **testnet (46630)** until audit + legal clear the path to mainnet.
