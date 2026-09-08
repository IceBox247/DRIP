# Architecture

Expands SPEC §6. Maps each component to its place in this repository.

## The fee is external (Pons) — this is the key architectural fact

Drip does **not** collect the trade fee. The launchpad is **Pons** (Robinhood Chain): Pons's venue
takes the trade fee, keeps its protocol cut, and pays our **creator share in ETH**. We collect it by
enabling **Pons automation that routes creator fees to a payout wallet we designate** (push). There
is **no Uniswap hook and no tax-on-transfer on our side**; DRIP is a plain ERC-20 (possibly
Pons-deployed).

Pons fee params are **set per launch, read on-chain, and immutable after launch**. The default is
~1% total / ~70% creator (~0.7% of volume); netting our ~3% target requires configuring a high fee
at launch (see SPEC §2.1, DECISIONS.md #5). Everything we build operates on that ETH revenue *after*
Pons pays it: split it, swap the auto-buy portion into Stock Tokens, run the reserve + reward engine.

## Layers

| Layer | Component | Repo location | Phase |
|---|---|---|---|
| Chain | Robinhood Chain (mainnet `4663` / testnet `46630`, EVM, Arbitrum Orbit) | — | — |
| Launchpad | **Pons** (external) — collects the trade fee, keeps its protocol cut, pays our creator share in ETH to our payout wallet | *not ours* | — |
| Contract | `DripToken` — plain ERC-20, no fee logic (may be Pons-deployed) | `contracts/src/DripToken.sol` | 1 |
| Contract | `FeeDistributor` — splits the **ETH creator fees received from Pons** → ~2/3 auto-buy / ~1/3 marketing. Optional on-chain; can live in the keeper | `contracts/src/FeeDistributor.sol` | 1 |
| Contract | `ReserveManager` — 50/50 split + dynamic drawdown | `contracts/src/ReserveManager.sol` | 3 |
| Contract | `RewardVault` — holds Stock Tokens, Merkle-claim payouts | `contracts/src/RewardVault.sol` | 3 |
| Automation | Keeper (Gelato / Chainlink Automation) — hourly: read ETH payout wallet, distribute, swap auto-buy ETH → Stock Token, run cycle | `keeper/` | 3 |
| Backend | Off-chain points engine — accounts, node timer, hash-rate calc, points ledger, task verification, referral graph | `backend/` | 2 |
| Backend | Auth — wallet connect + X OAuth | `backend/` | 2 |
| Frontend | Web + mobile — node dashboard, hash rate, claimable stock, referral link, task list | `frontend/` | 2 |

## Data flow

```
   DRIP trade
       │
       ▼
┌──────────────────┐
│      PONS        │  collects the trade fee (EXTERNAL — not ours)
│  trading venue   │  keeps its protocol cut; pays our creator share in ETH
└────────┬─────────┘
         │  ETH creator fees, via Pons automation (push)
         ▼
┌──────────────────┐
│  Payout wallet   │  a wallet WE designate; Pons automation routes ETH here
└────────┬─────────┘
         │  keeper reads ETH balance
         ▼
┌──────────────────┐
│ FeeDistributor   │  split (on-chain OR in keeper), of received ETH:
│  (or keeper)     │    ~2/3 → auto-buy buffer (ETH)
└────────┬─────────┘    ~1/3 → marketing/ops treasury
         │              (Pons already took its cut — nothing forwarded back)
   auto-buy buffer (ETH)
         │
         ▼
┌──────────────────────────────────┐
│ Keeper (hourly)                   │  swap ETH → Stock Token(s), slippage-bounded
└────────┬──────────────────────────┘
         ▼
┌────────────────┐
│ ReserveManager │  50% → Reserve, 50% → Distribution
│  50/50 split   │  (+ dynamic draw from Reserve on low-volume cycles)
└───────┬────────┘
        ▼
┌────────────────────────────────┐
│ Backend points engine          │  per-user allocation from points earned
│  → compute Merkle root          │  this cycle → Merkle root
└───────────────┬─────────────────┘
                ▼
        ┌────────────────┐
        │  RewardVault   │  publish root, users claim Stock Tokens
        │  Merkle claim  │
        └────────────────┘
```

## Fee-source adapter

Keep the Pons integration behind a small **adapter** so the rest of the system doesn't care how fees
arrive. For Pons the intended path is **push**:

- **Push mode (Pons default for us):** enable Pons automation to route creator fees (ETH) to our
  payout wallet. The keeper just reads that ETH balance — no privileged keys needed.
- **Pull mode (fallback):** the keeper calls Pons's claim entrypoint to collect accrued fees, then
  distributes. Needs claim rights; only if push automation isn't used.

Either way the keeper ends up with a known **ETH** balance to split + swap. Keep the Pons
integration isolated in one module (`keeper/`), with everything downstream (`FeeDistributor`,
`ReserveManager`, `RewardVault`) launchpad-agnostic — they just see "ETH in, Stock Token out."

## On-chain vs off-chain boundary

- **On-chain:** the fee wallet balance, the (optional) `FeeDistributor` split, the Stock-Token
  buffer/reserve/vault balances, the published Merkle root, and claims. Money and finality here.
- **Off-chain:** the points engine (node timer, hash-rate math, per-second accrual, task/referral
  graph) and the keeper orchestration. The backend computes allocations and commits only the
  **root** each cycle.

### Trust note

Per-user allocation is computed off-chain, so the backend is trusted to publish honest roots.
Mitigations for Phase 3: make the points ledger reproducible from public inputs, publish inputs
alongside each root, and consider a challenge window before a root becomes claimable.

## Keeper

Contracts can't self-trigger. An external keeper (Gelato or Chainlink Automation) drives the hourly
`read ETH → distribute → swap → cycle` path. Design on-chain entrypoints to be **permissionless-safe**
(idempotent per cycle, slippage-bounded swaps, no privileged assumptions about the caller) so a
keeper outage can't be exploited and anyone can poke the cycle. With Pons **push** automation the
keeper just reads the payout wallet — no privileged keys. Only the **pull-mode** fallback (calling
Pons's claim entrypoint) needs claim rights; isolate that if used.
