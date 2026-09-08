# Architecture

Expands SPEC §6. Maps each component to its place in this repository.

## The fee is external — this is the key architectural fact

Drip does **not** collect the trade fee. The **launchpad's trading venue** takes the 4% on every
DRIP trade and makes our share available — either **pushed** to a wallet we control or **pullable**
from the launchpad's fee wallet. There is **no Uniswap v4 hook and no tax-on-transfer on our side**;
DRIP is a plain ERC-20 (possibly launchpad-deployed).

Everything we build operates on that fee revenue *after* it is collected: split it, swap the 2% into
Stock Tokens, run the reserve + reward engine.

## Layers

| Layer | Component | Repo location | Phase |
|---|---|---|---|
| Chain | Robinhood Chain (mainnet `4663` / testnet `46630`, EVM, Arbitrum Orbit) | — | — |
| Launchpad | Fee collection (external) — takes 4% on trades, delivers our share to the fee wallet | *not ours* | — |
| Contract | `DripToken` — plain ERC-20, no fee logic (may be launchpad-deployed) | `contracts/src/DripToken.sol` | 1 |
| Contract | `FeeDistributor` — splits the fee **received from the launchpad** → 2% auto-buy / 1% marketing (/ 1% launchpad). Optional on-chain; can live in the keeper | `contracts/src/FeeDistributor.sol` | 1 |
| Contract | `ReserveManager` — 50/50 split + dynamic drawdown | `contracts/src/ReserveManager.sol` | 3 |
| Contract | `RewardVault` — holds Stock Tokens, Merkle-claim payouts | `contracts/src/RewardVault.sol` | 3 |
| Automation | Keeper (Gelato / Chainlink Automation) — hourly: pull/read fee wallet, distribute, swap 2% → Stock Token, run cycle | `keeper/` | 3 |
| Backend | Off-chain points engine — accounts, node timer, hash-rate calc, points ledger, task verification, referral graph | `backend/` | 2 |
| Backend | Auth — wallet connect + X OAuth | `backend/` | 2 |
| Frontend | Web + mobile — node dashboard, hash rate, claimable stock, referral link, task list | `frontend/` | 2 |

## Data flow

```
   DRIP trade
       │
       ▼
┌──────────────────┐
│    LAUNCHPAD      │  collects 4% fee on the trade (EXTERNAL — not ours)
│  trading venue   │  keeps 1%, delivers our share (push or pull)
└────────┬─────────┘
         │  fee revenue (net 3%, or gross 4%)
         ▼
┌──────────────────┐
│   Fee wallet     │  a wallet we control, or the launchpad's wallet we can pull from
└────────┬─────────┘
         │  keeper reads / pulls
         ▼
┌──────────────────┐
│ FeeDistributor   │  split (on-chain OR in keeper):
│  (or keeper)     │    2% → auto-buy buffer
└────────┬─────────┘    1% → marketing/ops treasury
         │              1% → launchpad (only if we received gross)
   2% auto-buy buffer
         │
         ▼
┌──────────────────────────────────┐
│ Keeper (hourly)                   │  swap buffer → Stock Token(s), slippage-bounded
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

Because delivery is launchpad-specific (and unconfirmed — DECISIONS.md #5), model the fee source
behind a small **adapter** so the rest of the system doesn't care how fees arrive:

- **Push mode:** launchpad credits a wallet we designate. The keeper just reads that balance.
- **Pull mode:** the keeper calls the launchpad's withdraw/claim entrypoint (needs rights/keys) to
  move fees into our fee wallet, then distributes.

Either way the keeper ends up with a known token balance to split + swap. Keep the launchpad
integration isolated in one module (`keeper/`), with everything downstream (`FeeDistributor`,
`ReserveManager`, `RewardVault`) launchpad-agnostic.

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
`read/pull fee → distribute → swap → cycle` path. Design on-chain entrypoints to be
**permissionless-safe** (idempotent per cycle, slippage-bounded swaps, no privileged assumptions
about the caller) so a keeper outage can't be exploited and anyone can poke the cycle. The one part
that may need privileged keys is **pull-mode** fee withdrawal from the launchpad — isolate that.
