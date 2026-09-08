# Grid Mine — ORE-style game mode for Drip (design)

An optional game mechanic for DRIP on Robinhood Chain, adapted from **ORE** (Solana). ORE dropped
real hash mining (it spammed the chain) for a **1-minute 5×5 grid game**: you deploy funds onto
tiles, an on-chain RNG picks a winning tile, losers' funds are redistributed to winners, and a
protocol cut buys back + burns the token. This doc maps that to an EVM/Robinhood + DRIP version.

> ⚠️⚠️ **READ [BLOCKERS.md](./BLOCKERS.md) #4 FIRST.** This is a **real-money game of chance**
> (lottery/casino mechanics: pooled stakes, RNG winner, jackpot). That is **separately regulated
> from securities** — in many jurisdictions online gambling is licensed or illegal, and offering it
> to U.S. persons is high-risk. This repo is engineering scaffolding, **not legal advice.** No
> mainnet, no real users, until gambling-law counsel + licensing + geoblocking are in place.

---

## The loop (per ~60s round)

1. Round opens for ~60 seconds. A 5×5 board = **25 tiles**.
2. Players `deploy(tileId, amount)` — stake the **deploy asset** (USDG, or WETH, or a stock token)
   onto one or more tiles.
3. Round closes. A **secure RNG** picks one winning tile (each tile 1/25 = 4%).
4. **Loser pot** = stake on the 24 losing tiles.
5. **Entry fee** = 1% of each deploy, **skimmed at deploy time before the funds enter the pool** →
   marketing/ops. Because it's taken up front, it never touches the win/loss math: the grid only
   ever holds the net 99%. (Accrues in the contract; `withdrawMarketing()` sends it to the wallet.)
6. **Protocol cut** = 10% of the loser pot (USDG). The rest of the loser pot (90%) is the **winner
   pot**, split among the winning tile **pro-rata by stake**, paid in **USDG**.
7. The 10% cut **buys DRIP** from the DRIP/USDG pool (Pons seeds it at launch), and the bought DRIP
   is split **70% burned / 10% stakers / 10% winners / 10% motherlode**.
8. **1-or-all (ORE):** 50% of rounds, one **weighted** winner (picked by a random ticket over the
   winning tile's stake) takes **all** the round DRIP; the other 50% it's shared pro-rata. The USDG
   pot is **always** pro-rata — only the DRIP reward is 1-or-all.
9. **Motherlode**: the 10% motherlode slice accrues in DRIP each round; a `1/625` hit adds the whole
   jackpot to that round's winners — and follows the same 1-or-all flip (solo round → the jackpot
   goes to the one winner too).
10. **Refining:** winners' DRIP accrues in `RefiningVault`; claiming costs 10% → to holders who
    haven't claimed.

**No-winner rounds (RNG lands on a tile nobody staked):** the entire net pool buys DRIP and **100%
is burned** — no funds are stranded and none go to the team; it's pure deflation that benefits every
DRIP holder. (Chosen over routing to the motherlode / next round.)

**Edge case — a lone player who covers the winning tile:** the loser pot is 0, so there's **no cut
and no DRIP bought** — they get their **net stake back** (the only cost is the flat 1% entry fee paid
at deploy). You can't win from yourself. (A lone player only loses their stake if the RNG lands on a
tile they didn't cover.)

## Stake to earn

`StakeVault` lets DRIP holders **stake and earn the 10% stakers' slice of every buyback** (Synthetix
accumulator). It's the holder sink that discourages dumping the DRIP won each round — bought DRIP
flows back to the people who hold and stake.

Spreading across tiles = win often, small. Stacking one tile = rare, fat. Rounds stay ~1 minute —
that cadence is the product.

## Rewards are BOUGHT, not minted (shipped v2)

**DRIP is fixed supply — the game never mints.** Every DRIP reward is *bought* from the market with
the USDG cut, so each round is net buy pressure on DRIP. The whole supply is created once at deploy
and handed to the Pons launch, which seeds the DRIP/USDG pool the game trades against.

Per round, the 10% USDG cut is apportioned. Most buys DRIP; the winners' slice is paid **6% as DRIP
+ 4% as NVDA** (tokenized NVIDIA), bought from the cut:

| Slice | % of the cut | Buys | Goes to |
|---|---|---|---|
| Burn | 70% | DRIP | burned ("bond"/bury) — deflationary |
| Stakers | 10% | DRIP | `StakeVault` |
| Motherlode | 10% | DRIP | jackpot pool; dumps to winners on a 1/625 hit |
| Winners — DRIP | 6% | DRIP | this round's winners (via `RefiningVault`) |
| Winners — NVDA | 4% | **NVDA** | this round's winners (held in GridMine, paid on harvest) |

**Winners get stock too.** The 4% NVDA slice follows the **same 1-or-all flip** as the DRIP (solo →
one weighted winner takes both; shared → pro-rata), but NVDA has **no motherlode** and **no refine
tax** — it's paid directly on harvest. No-winner rounds have no NVDA slice (the whole pool burns).

This replaces ORE's "mint 1 token/round." Marketing is funded separately by the **1% admin fee**, not
from this cut. Requires the DRIP/USDG pool to exist (Pons provides it at launch) — the swap is
slippage-bounded via a keeper-supplied `minDripOut`.

## Anti-dump: refining (claim tax)

Winners' bought DRIP accrues in a `RefiningVault`. Claiming costs `REFINE_FEE_BPS` (10%), and that fee
is redistributed to **holders who have not yet claimed** — fast sellers subsidize diamond hands.

## Randomness — do NOT use blockhash/timestamp alone

The winner must be unpredictable and un-manipulable (a miner/sequencer or a player must not be able
to bias or foresee the winning tile). Options, in preference order:

1. **Chainlink VRF** on Robinhood Chain — *if a VRF coordinator is deployed there* (VERIFY —
   DECISIONS #9). Cleanest.
2. **Commit–reveal** with a bonded operator + a fallback so funds can't be locked if the operator
   vanishes. No external infra dependency.

Never let the owner pick the tile. Never derive the winner solely from `block.timestamp`,
`blockhash`, or `block.number`.

## Timing on Robinhood Chain (Arbitrum Orbit)

`block.number` is the L1 block, not the L2 block. For round bookkeeping use timestamps with a grace
window, or the ArbSys precompile (verified live — see [ROBINHOOD-CHAIN.md](./ROBINHOOD-CHAIN.md)):
`ArbSys(0x0000000000000000000000000000000000000064).arbBlockNumber()`.

## Deploy asset — the Robinhood twist

The staked asset can be **USDG**, **WETH**, or a **stock token** (NVDA/SPY/GME). Using a stock token
as the fuel, and buying back DRIP in the `DRIP/<stock>` pool, fuses the ORE mechanic with the
RWA-pairing infra (see ROBINHOOD-CHAIN.md). Reward-token transferability still applies (BLOCKERS #1)
if winners receive stock; paying winners in the same deploy asset is simplest. Default deploy asset:
**USDG** (DECISIONS #10).

## Contracts

| File | Role | Status |
|---|---|---|
| `contracts/src/game/DripToken.sol` | **Fixed-supply** ERC-20 (burnable). No mint, no owner. Whole supply → the Pons launch. | ✅ implemented + tested |
| `contracts/src/game/GridMine.sol` | Rounds, `deploy(tile,amount)`, close, RNG winner, `processRewards` (buy DRIP + split), `harvest`. | ✅ implemented + tested |
| `contracts/src/game/RefiningVault.sol` | Holds winners' bought DRIP; 10% claim tax redistributed to unclaimed (acc pattern). | ✅ implemented + tested |
| `contracts/src/game/StakeVault.sol` | Stake DRIP, earn the stakers' slice of each buyback (Synthetix-style). | ✅ implemented + tested |
| `contracts/src/game/interfaces/`, `mocks/` | Randomness + swap-router interfaces; test mocks. | ✅ |
| `contracts/script/DeployGame.s.sol` | Wires the whole game for testnet deploy. | ✅ |

The buyback/burn/stakers/motherlode split now lives **inside `GridMine.processRewards`** (a
permissionless keeper step that swaps the USDG cut → DRIP with a slippage bound), so there's no
separate `Buyback` contract and no mint token. Randomness is behind `IRandomnessSource` (VRF or
commit–reveal); tests use `MockRandomness`. v2 splits winner DRIP pro-rata (no solo-winner yet).

## Params (all tunable — `config/constants.example.json` → `gridMine`)

| Param | Value |
|---|---|
| Grid | 5×5 = 25 tiles |
| Round | 60 s |
| Deploy asset | USDG |
| DRIP supply | fixed (no mint) |
| Admin fee | 1% of gross → marketing/ops |
| Protocol cut | 10% of loser pot → buys DRIP (+ winners' NVDA slice) |
| Cut split | 70% burn / 10% stakers / 10% motherlode / 6% winners-DRIP / 4% winners-NVDA |
| Winner stock | NVDA (tokenized NVIDIA) — 4% of the cut, 1-or-all, no motherlode/refine tax |
| Motherlode hit | 1/625 |
| Refining (claim) tax | 10% on DRIP → unclaimed holders |

Verified end-to-end against **real USDG** on a Robinhood mainnet fork (`test/game/ForkUSDG.t.sol`).

## Relationship to the existing reward engine — DECIDE (DECISIONS #8)

Drip already has a reward model (fees → buy stock → distribute by hash-rate/points, SPEC §2–3).
Grid Mine is a **different** mechanic. Pick one:

- **Complement:** keep the passive hold-and-earn-stock model *and* add Grid Mine as an active game
  mode. Two engines, more surface area (and more legal exposure — now securities *and* gambling).
- **Replace:** Grid Mine becomes the core loop; the vague "hash-rate points" idea is retired in
  favor of this concrete game. Simpler story, but it's a casino, not a "mining rewards" product.

Not decided. This changes the whole product's framing, so resolve it before building game logic
beyond the skeletons.

## Build order (testnet 46630)

1. `DripToken` (fixed cap) + `EmissionsReserve` seeded with the game allocation.
2. `GridMine` with **commit–reveal** RNG first (works with no external infra); swap to VRF if a
   coordinator exists.
3. `RefiningVault` (claim tax).
4. `DRIP/USDG` (or `/stock`) Uniswap v4 pool + `Buyback` keeper.
5. Frontend: 5×5 grid, deploy amount, live round timer, auto-redeploy.

## What NOT to copy

- No hash mining (ORE dropped it — it spam-killed the chain).
- Owner never picks the winner.
- No unlimited mint (we use a fixed reserve).
- Never skip the buyback (without it, it's just a casino).
