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
5. **Protocol cut** = `LOSER_CUT_BPS` of the loser pot (ORE ~10%). Rest is the **winner pot**.
6. Winners on the winning tile split the winner pot **pro-rata by their stake on that tile**.
7. Each round emits **~1 DRIP** to winners — paid from a **pre-funded emissions reserve** (see
   "Emissions" — we do NOT mint).
8. **Motherlode** jackpot: `+MOTHERLODE_PER_ROUND` DRIP added each round; a `1/625` chance it all
   dumps on the winning tile.
9. Protocol cut → **Buyback**: buy DRIP in the Uniswap v4 pool, burn most, small slice to stakers.

Spreading across tiles = win often, small. Stacking one tile = rare, fat. Rounds stay ~1 minute —
that cadence is the product.

## Emissions — mint model (shipped v1) vs reserve model

Two ways to pay the ~1 DRIP/round emission:

- **Mint model (shipped v1 — `contracts/src/game/`):** `DripMineToken` is a **capped** ERC-20 whose
  **only minter is GridMine**, set once then **locked** (`lockMinter()`), no team allocation. GridMine
  mints the round emission to winners up to the hard cap. This is ORE's model, ported.
- **Reserve model (alternative):** pre-mint the whole cap to a **locked reserve** and have GridMine
  *pay* from it instead of minting. Keeps a strictly fixed supply with no mint authority at all —
  better if DRIP must be a Pons fixed-supply fair launch (SPEC §1, DECISIONS #6/#8).

v1 ships the mint model because it matches ORE and is simplest; the cap + locked-minter + zero team
allocation keep it credible. Switching to the reserve model later is a localized change (swap the
`drip.mint(...)` call in `GridMine.harvest` for a `reserve.release(...)`).

## Anti-dump: refining (claim tax)

Winners' DRIP accrues in a `RefiningVault`. Claiming costs `REFINE_FEE_BPS` (ORE ~10%), and that fee
is redistributed to **holders who have not yet claimed** — fast sellers subsidize diamond hands.

## Buyback / burn

Protocol cut (in the deploy asset) → swap to DRIP in the `DRIP/<deploy asset>` Uniswap v4 pool →
**burn `BURN_BPS` (ORE ~90%)**, remainder to stakers. If buybacks outrun emissions, effective float
shrinks. Without the buyback this is just a 25-square casino — it's the buyback that makes it a
token engine.

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
| `contracts/src/game/DripMineToken.sol` | Capped ERC-20; only GridMine mints (set once + locked); no team. | ✅ implemented + tested |
| `contracts/src/game/GridMine.sol` | Rounds, `deploy(tile,amount)`, close, RNG winner, `harvest` payout, protocol cut. | ✅ implemented + tested |
| `contracts/src/game/RefiningVault.sol` | Holds winners' DRIP; 10% claim tax redistributed to unclaimed (acc pattern). | ✅ implemented + tested |
| `contracts/src/game/Buyback.sol` | Protocol cut → swap to DRIP → burn 90%, 10% to stakers. | ✅ implemented + tested |
| `contracts/src/game/StakeVault.sol` | Stake DRIP, earn buyback rewards (Synthetix-style). | ✅ implemented + tested |
| `contracts/src/game/interfaces/`, `mocks/` | Randomness + swap-router interfaces; test mocks. | ✅ |
| `contracts/script/DeployGame.s.sol` | Wires the whole game for testnet deploy. | ✅ |

Randomness ships behind `IRandomnessSource` (VRF or commit–reveal); the test uses `MockRandomness`.
v1 **always splits the DRIP emission pro-rata** (no solo-winner — deferred to v2, per the ORE guide).

## Suggested v1 params (all tunable — `config/constants.example.json` → `gridMine`)

| Param | Start |
|---|---|
| Grid | 5×5 = 25 tiles |
| Round | 60 s |
| Deploy asset | USDG |
| Protocol cut | 10% of loser pot |
| Emission | ~1 DRIP / round (from reserve) |
| Motherlode | +0.2 DRIP / round, 1/625 hit |
| Refining (claim) tax | 10% → unclaimed holders |
| Buyback split | 90% burn / 10% stakers |

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
