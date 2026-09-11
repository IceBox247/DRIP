# Drip ($DRIP) — Grid Mine on Robinhood Chain

![License: MIT](https://img.shields.io/badge/License-MIT-informational)
![Solidity](https://img.shields.io/badge/Solidity-0.8.26-363636)
![Foundry](https://img.shields.io/badge/Built%20with-Foundry-red)
![Tests](https://img.shields.io/badge/contract%20tests-28%20passing-brightgreen)
![Chain](https://img.shields.io/badge/Robinhood%20Chain-4663-c6f24e)

**Drip** is a fair-launch ERC-20 on **Robinhood Chain** with an on-chain, ORE-style grid game — **Grid
Mine**. Twenty-five tiles, a sixty-second round, one winning tile. Players deploy **USDG** onto tiles;
a randomness source picks the winner; losers' USDG is redistributed to the winners, and a slice of
every round automatically **buys $DRIP and tokenized NVDA on-chain** to reward winners, feed stakers,
grow a jackpot, and burn supply. The team holds no tokens.

> **25 blocks. 60 seconds. One winning block.** Deploy USDG, claim your tile, let on-chain randomness decide.

- App: [driprh.site](https://driprh.site) · Game: [driprh.site/game](https://driprh.site/game)
- Chain: Robinhood Chain (Arbitrum Orbit L2) — mainnet **4663**, testnet **46630**
- Full spec: [`docs/SPEC.md`](./docs/SPEC.md) · Game design: [`docs/GRID-MINE.md`](./docs/GRID-MINE.md)

---

## How a round works

1. **Deploy** — players stake USDG onto any of the 25 tiles in a 60-second round (one transaction,
   many tiles). A 1% entry fee goes to marketing/ops.
2. **Settle** — when the window elapses, a randomness source picks the winning tile. The deploy that
   rolls a finished round settles it automatically — no keeper required to keep play flowing.
3. **Payout** — winners get their stake back plus **90% of the loser pot in USDG**. The remaining
   **10% cut** is swapped on-chain and split:

   | Slice of the cut | Destination |
   |---|---|
   | 70% | buy $DRIP → **burned** |
   | 10% | buy $DRIP → **stakers** |
   | 10% | buy $DRIP → **motherlode** (1/625 jackpot) |
   | 6%  | buy $DRIP → **winners** (refinable) |
   | 4%  | buy **NVDA** → **winners** |

4. **Refine** — winner DRIP accrues in a RefiningVault; claiming charges a 10% refine tax that flows
   to holders who haven't claimed yet (hold longer, earn more).

Nothing is minted — $DRIP is fixed supply. The reward engine only ever **buys** it from the market.

## Real on-chain integrations

The reward engine buys through the actual venues on Robinhood Chain, not a mock:

- **$DRIP** is bought from its **Pons V2 bonding curve** (`buy(quoteIn, minOut, recipient)`), and
  automatically routes to the token's locked **Uniswap v4** pool once it graduates.
- **NVDA** (tokenized NVIDIA) is bought from its **Uniswap v4** pool, called through the PoolManager
  directly (Robinhood's Universal Router is modified). This path is **fork-tested against the live
  mainnet pool** — see [`contracts/test/game/V4NvdaFork.t.sol`](./contracts/test/game/V4NvdaFork.t.sol).

The swap venue per token lives in [`PonsSwapAdapter`](./contracts/src/game/PonsSwapAdapter.sol) behind
the game's [`ISwapRouter`](./contracts/src/game/interfaces/ISwapRouter.sol), so the game contract is
agnostic to how a reward is sourced.

## Contracts

Solidity 0.8.26, Foundry, OpenZeppelin v5. `contracts/src/game/`:

| Contract | Role |
|---|---|
| `GridMine.sol` | The round engine: deploy, settle, weighted winner selection, payouts, harvest |
| `RefiningVault.sol` | Holds winner DRIP; refine-to-claim with the holder tax |
| `StakeVault.sol` | Stake DRIP, earn the stakers' slice each round |
| `PonsSwapAdapter.sol` | Buys rewards from the Pons curve / Uniswap v4 pool |
| `CommitRevealRandomness.sol` | Bonded commit–reveal RNG (unpredictable, un-riggable) |
| `DripToken.sol` | Fixed-supply, burnable ERC-20 |

```bash
cd contracts
forge test            # 28 tests (unit + a live-pool fork test that skips without an RPC)
forge build
```

## Repository layout

```
contracts/   Solidity (Foundry) — the game engine, vaults, swap adapter, RNG, tests
frontend/    Next.js 14 + wagmi/viem app (the Mine/Stake/Trade/Chat UI)
keeper/       Round automation notes (settle + process rewards)
backend/      Off-chain chat + auth notes
docs/         Specification and design docs (SPEC, GRID-MINE, ARCHITECTURE, DECISIONS, BLOCKERS)
config/       Tunable constants
.github/      CI + the phone-friendly deploy workflow
```

## Tech stack

- **Contracts:** Solidity 0.8.26 · Foundry · OpenZeppelin v5
- **Frontend:** Next.js 14 (App Router) · TypeScript · Tailwind · wagmi 2 / viem 2 · TanStack Query
- **Data:** Neon Postgres (serverless) for chat
- **Chain:** Robinhood Chain (Arbitrum Orbit), USDG-quoted markets, Uniswap v4, Pons launchpad

## Status & safety

Grid Mine is deployed and playable on **mainnet** for controlled testing. Before a public launch, two
gates remain open and are tracked in [`docs/BLOCKERS.md`](./docs/BLOCKERS.md):

- **Randomness** — the production RNG is the audited [commit–reveal](./contracts/src/game/CommitRevealRandomness.sol)
  source (or a VRF if one is confirmed on the chain); the mock is testnet/controlled-test only.
- **Legal** — a real-money game of chance plus stock-token rewards is regulated. Counsel, licensing,
  and geoblocking are required before opening to the public. This repository is engineering
  scaffolding, **not legal advice**.

No public launch or reward promises until those clear.

## License

[MIT](./LICENSE).
