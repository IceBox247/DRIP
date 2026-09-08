# Architecture

Expands SPEC §6. Maps each component to its place in this repository.

## Layers

| Layer | Component | Repo location | Phase |
|---|---|---|---|
| Chain | Robinhood Chain (mainnet `4663` / testnet `46630`, EVM, Arbitrum Orbit) | — | — |
| Contract | `DripToken` — ERC-20, fee via Uniswap v4 hook | `contracts/src/DripToken.sol` | 1 |
| Contract | `DripFeeHook` — Uniswap v4 hook that levies the 4% on swaps | `contracts/src/hooks/DripFeeHook.sol` | 1 |
| Contract | `FeeRouter` — splits 4% → 1% / 2% / 1% | `contracts/src/FeeRouter.sol` | 1 |
| Contract | `ReserveManager` — 50/50 split + dynamic drawdown | `contracts/src/ReserveManager.sol` | 3 |
| Contract | `RewardVault` — holds Stock Tokens, Merkle-claim payouts | `contracts/src/RewardVault.sol` | 3 |
| Automation | Keeper (Gelato / Chainlink Automation) — hourly auto-buy + convert + split | `keeper/` | 3 |
| Backend | Off-chain points engine — accounts, node timer, hash-rate calc, points ledger, task verification, referral graph | `backend/` | 2 |
| Backend | Auth — wallet connect + X OAuth | `backend/` | 2 |
| Frontend | Web + mobile — node dashboard, hash rate, claimable stock, referral link, task list | `frontend/` | 2 |

## Data flow

```
             ┌────────────┐
  DRIP trade │ Uniswap v4 │  4% fee levied by hook (NOT in transfer())
 ──────────► │  + Hook    │ ───────────────┐
             └────────────┘                │
                                           ▼
                                    ┌──────────────┐
                                    │  FeeRouter   │  splits 4%
                                    └──────┬───────┘
                        1% launchpad ◄─────┼─────► 1% marketing/ops
                                           │
                                    2% auto-buy buffer
                                           │
                          ┌────────────────▼─────────────────┐
                          │ Keeper (hourly)                   │
                          │  swap buffer → Stock Token(s)     │
                          └────────────────┬──────────────────┘
                                           ▼
                                   ┌────────────────┐
                                   │ ReserveManager │  50% → Reserve
                                   │  50/50 split   │  50% → Distribution
                                   └───────┬────────┘   (+ dynamic draw from
                                           │             Reserve on low-vol cycles)
                                           ▼
                          ┌────────────────────────────────┐
                          │ Backend points engine          │
                          │  per-user allocation from       │
                          │  points earned this cycle        │
                          │  → compute Merkle root           │
                          └───────────────┬──────────────────┘
                                          ▼
                                  ┌────────────────┐
                                  │  RewardVault   │  publish root,
                                  │  Merkle claim  │  users claim Stock Tokens
                                  └────────────────┘
```

## On-chain vs off-chain boundary

- **On-chain:** fee levy + routing, the Stock-Token buffer/reserve/vault balances, the published
  Merkle root, and claims. Money and finality live here.
- **Off-chain:** the points engine (node timer, hash-rate math, per-second accrual, task/referral
  graph). Millions of micro-updates on-chain would be unaffordable — the backend computes
  allocations and commits only the **root** each cycle.

### Trust note

Because per-user allocation is computed off-chain, the backend is trusted to publish honest roots.
Mitigations to consider in Phase 3: make the points ledger auditable/reproducible (deterministic
recompute from public inputs), publish inputs alongside each root, and consider a challenge window
before a root becomes claimable.

## Keeper

Contracts can't self-trigger. An external keeper (Gelato or Chainlink Automation) calls the hourly
`auto-buy → convert → split` path. Design the on-chain entrypoints to be **permissionless-safe**
(idempotent per cycle, slippage-bounded swaps, no privileged assumptions about the caller) so a
keeper outage can't be exploited and anyone can poke the cycle.
