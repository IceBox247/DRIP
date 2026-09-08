# Drip ($DRIP) — Build Specification

> **Purpose:** Master spec for building the Drip platform. This is the source of truth.
> Numbers marked `[DEFAULT]` are suggested starting values — tune before launch.
>
> **Status:** Phase 0 (see [ROADMAP.md](./ROADMAP.md)). The blockers in §8 and the open
> decisions in §7 MUST be resolved before contract implementation begins. See
> [BLOCKERS.md](./BLOCKERS.md) and [DECISIONS.md](./DECISIONS.md).

---

## 1. Concept (one paragraph)

Drip is a **fair-launch ERC-20 token** on **Robinhood Chain** whose **4% trade fee** funds a
**tokenized-stock reward pool**. The team holds no tokens. Users connect a wallet + X account,
run an in-app "mining node" (a server-side accrual timer — **not** real mining), and earn
**hash rate** based on how much DRIP they hold, plus boosts from tasks and referrals. Hash rate
accrues points; points entitle users to claim **real Stock Tokens** bought by the fee engine.
The more DRIP you hold, the larger your share of the stock.

---

## 2. Core mechanics

### 2.1 The fee (4% on DRIP trades)

| Slice | % | Destination |
|---|---|---|
| Launchpad | 1% | Launchpad wallet (fixed by launchpad) |
| Auto-buy | 2% | Stock-buy buffer → converted to Stock Tokens hourly |
| Marketing / Ops | 1% | Marketing treasury (**also funds servers/audit/legal — see §7**) |

Implement the fee as a **Uniswap v4 hook**, NOT inside the token's `transfer()` function.
Tax-on-transfer logic in `transfer()` breaks DEX routers; Robinhood Chain has Uniswap v4 hooks,
which is the clean way.

### 2.2 Hash rate formula `[DEFAULT]`

```
hash_rate = BASE_RATE
          + (drip_held ^ 0.75) * HOLDING_MULTIPLIER   // ^0.75 = diminishing returns, whales don't vacuum
          + task_boosts
          + referral_boosts
```

- `BASE_RATE` `[DEFAULT: 1]` — everyone mines a little even with 0 DRIP (drives sign-ups).
- Exponent `0.75` `[DEFAULT]` — sub-linear so large holders get more but not proportionally
  more. **Tune this; it's the anti-whale dial.**
- Points accrue **per-second** while node is active, as a stream (not a snapshot at claim time —
  prevents "hold big right before claiming, dump after").

### 2.3 Points → Stock conversion

- Each distribution cycle, the **distributable stock** (see §3) is split across all active miners
  **pro-rata by points earned that cycle**.
- `user_stock_this_cycle = distributable_stock * (user_points / total_points)`
- Points reset (or decay) each cycle so it's a per-cycle share, not an ever-growing claim on a
  fixed pool.

### 2.4 Claiming

- Claim via **Merkle drop**: backend computes each user's stock allocation per cycle, publishes a
  Merkle root on-chain, users claim from the vault contract.
- **Claim cooldown** `[DEFAULT: none, but consider 1h]` to reduce spam txns.

---

## 3. The Reserve Engine (smoothing buffer)

**This is what keeps rewards alive on zero-volume days.**

Every cycle `[DEFAULT: hourly]`:

1. Auto-buy buffer (the 2%) is swapped for target Stock Token(s).
2. Of the stock acquired this cycle: **50% → Reserve**, **50% → Distribution pool**.
3. Distribution pool is paid out pro-rata (see §2.3).

On low/zero-volume cycles (little or no new stock bought):

- Draw from the **Reserve** to keep payouts flowing.
- **Dynamic drawdown rate** based on reserve health:

  | Reserve level | Draw per cycle |
  |---|---|
  | High `[DEFAULT: > 60% of all-time peak]` | 2% |
  | Medium | 3–4% |
  | Low `[DEFAULT: < 20% of peak]` | 5% |

- Rationale: high reserve = drip slowly, low reserve = release faster to keep users engaged
  without emptying it.

---

## 4. Referral system

- Every user gets a **unique referral link**.
- To access the site, a referred user must **connect their X account** → this attributes the
  referral.
- When the referred user **connects a wallet and starts earning**, the **referrer earns a % of the
  referred user's earnings** (affiliate override — does NOT reduce the friend's earnings; it's
  minted from a referral allocation or a small skim).
- `REFERRAL_RATE` `[DEFAULT: 10% of referred user's earned stock, override]`
- **Decide:** single-level or multi-level? `[DEFAULT: single level — simpler, less Ponzi-optics/legal risk]`
- **Anti-abuse:** X account age/follower minimums, one referral per unique X account + wallet pair,
  sybil detection.

---

## 5. Tasks (hash-rate boosts)

- Simple social/engagement tasks: retweet a post, comment, follow, etc.
- Completing a task adds a **temporary or permanent boost** to hash rate.
- `TASK_BOOST` `[DEFAULT: +X hash for Y hours per task]`
- Verification: via X API (needs the connected X account) or manual/oracle check.
  **Flag:** X API access + cost.

---

## 6. Technical architecture

| Layer | Component | Notes |
|---|---|---|
| Chain | Robinhood Chain | Mainnet chain ID **4663**, testnet **46630**. EVM, Arbitrum Orbit stack. |
| Contract | `DripToken.sol` | ERC-20, fee logic via Uniswap v4 hook. |
| Contract | `FeeRouter.sol` | Splits 4% → 1/2/1. |
| Contract | `RewardVault.sol` | Holds Stock Tokens, Merkle-claim payouts. |
| Contract | `ReserveManager.sol` | 50/50 split + dynamic drawdown logic (§3). |
| Automation | Keeper (Gelato or Chainlink Automation) | **Contracts can't self-trigger.** External keeper calls the hourly auto-buy + convert + split. |
| Backend | Off-chain points engine | User accounts, node timer, hash-rate calc, points ledger, task verification, referral graph. Off-chain because millions of micro-updates on-chain = unaffordable. |
| Backend | Auth | Wallet connect + X OAuth. |
| Frontend | Web + mobile | Node dashboard, hash rate, claimable stock, referral link, task list. |

**Data flow:** trade → 4% fee → FeeRouter → 2% buffer → keeper (hourly) swaps to Stock Token →
ReserveManager splits 50/50 → backend computes per-user allocations from points → publishes Merkle
root → users claim from RewardVault.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the expanded diagram and repository mapping.

---

## 7. Open decisions (resolve before Phase 1)

1. **Ops funding.** Team holds no tokens. Servers, audit (5-figure, non-negotiable), legal, and
   X API all cost money. Right now only the 1% marketing slice can cover this. **Decide:** does
   marketing 1% double as ops treasury, or add a small ops slice?
2. **Points unit name.** Is there a specific name for the in-app earning unit (the "hash/points")?
   (The voice note mentioned a term I couldn't decode.)
3. **Which Stock Token(s)** does the 2% buy? One (e.g. a broad ETF token) or a basket?
   `[DEFAULT: single liquid ETF-style token for simplicity]`
4. **Referral depth** (§4).

Tracked in [DECISIONS.md](./DECISIONS.md).

---

## 8. Two blockers that can invalidate the design

1. **⚠️ Stock Token transferability — VERIFY FIRST.** The entire reward payout depends on
   transferring Stock Tokens to arbitrary user wallets. These were whitelist-gated early on.
   **Confirm on-chain that Stock Tokens are freely transferable before building the vault/claim
   layer.** If restricted, the reward mechanic doesn't work as designed and needs a wrapper or a
   different reward asset.
2. **⚠️ Legal.** A token people buy + a promise of stock-token rewards for holding/tasking is close
   to the textbook definition of an **investment contract** (securities exposure), and Stock Tokens
   are **blocked for US persons**. This is not legal advice — **get counsel and structure offshore +
   geoblock US before launch.**

Tracked in [BLOCKERS.md](./BLOCKERS.md).

---

## 9. Build order

- **Phase 0 — Legal + tokenomics finalize + ops funding.** (Do first.)
- **Phase 1 — Contracts on testnet (46630):** DripToken + FeeRouter + fee hook.
- **Phase 2 — Backend + app:** accounts, node timer, hash rate, points, X auth, tasks, referral graph.
- **Phase 3 — Reward engine:** keeper auto-buy + ReserveManager (50/50 + dynamic draw) + RewardVault + Merkle claim.
- **Phase 4 — Audit → mainnet → launchpad listing → seed liquidity → marketing.**

See [ROADMAP.md](./ROADMAP.md).

---

## 10. Suggested default constants (tune all)

```
FEE_TOTAL          = 4%
FEE_LAUNCHPAD      = 1%
FEE_AUTOBUY        = 2%
FEE_MARKETING      = 1%
CYCLE              = 1 hour
RESERVE_SPLIT      = 50% reserve / 50% distribute
RESERVE_DRAW_HIGH  = 2%
RESERVE_DRAW_LOW   = 5%
HASH_BASE_RATE     = 1
HASH_EXPONENT      = 0.75
REFERRAL_RATE      = 10% override, single level
TOTAL_SUPPLY       = TBD
```

Machine-readable version: [`../config/constants.example.json`](../config/constants.example.json).
