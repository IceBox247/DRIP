# Robinhood Chain — integration reference

Concrete infra facts for building on Robinhood Chain, with the pieces DRIP needs. Some values here
are **verified on-chain** (noted); treat everything else as *to confirm* against Robinhood's docs +
registry before you rely on it.

## Official docs (start here)

- Chain overview — `https://docs.robinhood.com/chain`
- Connect / RPC — `https://docs.robinhood.com/chain/connecting`
- Deploy contracts — `https://docs.robinhood.com/chain/deploy-smart-contracts`
- Stock Tokens — `https://docs.robinhood.com/chain/stock-tokens`
- Canonical token addresses — `https://docs.robinhood.com/chain/contracts`
- **Stock Token registry API** — `GET https://api.robinhood.com/rhj/assets` → resolve ticker →
  official contract address. **Use this; do not hardcode stock-token addresses beyond a verified cache.**

## Network

| | Mainnet | Testnet |
|---|---|---|
| Chain ID | **4663** (`0x1237`, verified) | 46630 |
| RPC | `https://rpc.mainnet.chain.robinhood.com` | (Robinhood testnet RPC) |
| Explorer | `https://robinhoodchain.blockscout.com` (Blockscout) | — |
| Stack | Arbitrum Orbit L2, EVM | same |
| Native gas | **ETH** (bridge in via the canonical Arbitrum/Robinhood bridge) | — |

You need ETH on the chain for contract deploys and pool creation. Uniswap v2/v3/v4 are live and hold
essentially all stock-token liquidity; **v4 is the main venue** for stock pairs.

## Official token addresses (verified on-chain, mainnet)

Verified 2026-09-08 by `symbol()` / `decimals()` `eth_call` against the mainnet RPC (chainId 4663).
Mirrored in [`../config/constants.example.json`](../config/constants.example.json) → `stockTokens`.

| Asset | Address | Decimals |
|---|---|---|
| USDG (Global Dollar stablecoin) | `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168` | 6 |
| WETH | `0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73` | 18 |
| NVDA (Nvidia stock token) | `0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC` | 18 |
| AAPL (Apple stock token) | `0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9` | 18 |

> ⚠️ **Always re-verify at integration time.** These four are confirmed, but the full stock-token
> set is larger and changes. The authoritative source is Robinhood's registry API
> (`GET https://api.robinhood.com/rhj/assets`) + Blockscout. Never hardcode a stock-token address
> you haven't just re-checked — a wrong address sends funds to the wrong token.
>
> **Never invent your own "NVDA/GME token."** Stock tokens are permissioned issuance (below); you can
> only trade/LP against the ones Robinhood issued.

## Two ways DRIP can relate to stock tokens — a design decision

These are different and DRIP must be explicit about which it does (couples to
[DECISIONS.md](./DECISIONS.md) #3 and #7):

1. **Reward model (current SPEC).** DRIP trades generate fee revenue (USDG via Pons); the keeper
   *buys* stock tokens with it and distributes them as rewards. Stock exposure is a *reward*, held by
   the vault then claimed.
2. **Paired-against-RWA model (Long/Bankr style).** DRIP's AMM pool is `DRIP / <stock token>` (e.g.
   `DRIP/NVDA`), so DRIP is *priced in* that stock, not in ETH/USDG. This is a market-structure
   choice about DRIP's own liquidity pair, separate from the reward mechanic.

They can coexist (e.g. DRIP paired against USDG for a stable market, while fees buy stock for
rewards), but pick deliberately. **Paired-against-RWA is not 1:1 backing** — a buyer takes two risks:
DRIP vs. the stock, and the stock vs. USD. Keep that honest in any copy (BLOCKERS #2).

## Build stack

Normal EVM tooling — the chain is fully EVM-compatible.

| Layer | Use |
|---|---|
| Contracts | Solidity + OpenZeppelin ERC-20 |
| Deploy | Foundry (official path) or Hardhat; Blockscout verify uses the explorer API |
| Client | `viem` + `wagmi` |
| Wallets | MetaMask / Rabby / Privy / Alchemy AA (for gasless onboarding) |
| AMM | Uniswap **v4 first**, v3 as fallback |
| Indexing | Bitquery / Dune (Robinhood DEX schemas) + Robinhood `/rhj` API |
| Oracles | Chainlink (keep a pool near the real stock price; market-hours-aware fees) |

Optional: `hood-cli` for quick token deploy / swap testing; LayerZero only if cross-chain is needed
later (not for v1).

## Uniswap v4 addresses & gotchas

Uniswap v4 is the main venue for stock-token liquidity on Robinhood Chain.

| Contract | Address | Status |
|---|---|---|
| StateView | `0xf3334192d15450cdd385c8b70e03f9a6bd9e673b` | ✅ bytecode verified on-chain |
| Quoter | `0x8dc178efb8111bb0973dd9d722ebeff267c98f94` | ✅ bytecode verified on-chain |
| PoolManager | `0x8366a39CC670B4001A1121B8F6A443A643e409…` | ⚠️ **truncated in source — get the full address from Uniswap's v4 deployment docs / Robinhood docs and verify before use** |

**Gotchas:**

- **Universal Router is slightly modified** on Robinhood Chain — standard Uniswap SDK calldata can
  revert. Several teams **call `PoolManager` directly** instead. Plan the keeper's swap around that.
- **`block.number` is the L1 block, not the L2 block** (Arbitrum Orbit). For L2 block height use the
  ArbSys precompile (verified live at `0x0000000000000000000000000000000000000064`):
  `uint256 l2Block = ArbSys(0x64).arbBlockNumber();`
- **Token ordering in a v4 `PoolKey`:** `currency0` is the lower address. e.g. USDG
  (`0x5fc5…`) < NVDA (`0xd060…`), so USDG is `currency0`. Minimal init:
  ```solidity
  PoolKey memory key = PoolKey({
      currency0: currency0,  // lower address
      currency1: currency1,  // higher address
      fee: 3000,             // 0.3%; 1% (10000) also common for volatile pairs
      tickSpacing: 60,
      hooks: address(0)      // or a custom hook
  });
  IPoolManager(POOL_MANAGER).initialize(key, sqrtPriceX96);
  ```
  v4 create-pool guide: `developers.uniswap.org/docs/sdks/v4/guides/create-pool` — point the SDK at
  chainId 4663 and the Robinhood `PoolManager`.

## If we build the pairing/launch ourselves (infra checklist)

- **Token factory** — deploy a standard fixed-supply ERC-20 (OpenZeppelin), no post-deploy mint,
  verified on Blockscout. (Or let the launchpad deploy it — DECISIONS #6.)
- **Pair resolver** — map ticker → official stock-token address from Robinhood's registry API. Do not
  hardcode beyond a verified cache.
- **Pool creator** — Uniswap v3 `PositionManager` or v4 `PoolManager` to create `DRIP/<stock>` (or
  `DRIP/USDG`). Common fee tiers 0.3% / 1% for volatile pairs.
- **Router** — let users pay in ETH/USDG; route ETH → USDG/WETH → stock token → DRIP under the hood
  (frontend can still read "buy with ETH").
- **Indexing** — watch Uniswap v4 `PoolManager` events + stock-token transfers. Bitquery and Dune
  already have Robinhood DEX schemas.
- **Oracles** — Chainlink feeds exist for fair pricing vs. the real stock; some v4 hooks use them for
  market-hours-aware fees.

## Launchpad options

**Pons is our choice** (see SPEC §2.1) — it collects the trade fee, pays creator fees in USDG, and
is adding custom stock pairs. The alternatives below are fallbacks only if Pons can't do a pairing we
need; they don't change our design, since a launchpad just automates deploy + pool-seed + fee split.

- **Pons** — current choice. Trade-fee collection, creator fees in USDG.
- **long.xyz** — purpose-built for RWA-paired memes (NVDA, SPCX, …); bakes the stock pairing in at
  launch and seeds liquidity against the official stock token in one flow.
- **Bankr** — RWA-paired token pads.
- **Hookdaq** — explicitly supports ETH **or** a Robinhood Stock Token as the quote asset.

A pad that "bakes the pairing in" launches the token and seeds the liquidity pool for you, so you
don't hand-seed. What to confirm with **Pons** for DRIP: (a) creator fee split + that it nets our
target, (b) fee currency (USDG), (c) **which pair it lets us launch against** — USDG (our current
reward-model assumption) or directly a stock token (paired-against-RWA model, see design decision
above), and (d) whether Pons deploys the token (DECISIONS #6). If Pons can't do a pairing we decide
we want, a fallback pad above can — but that's a fallback, not the plan.

## ⚠️ Hard constraints (these hit our blockers)

- **Permissioned issuance.** You cannot mint NVDA/GME/etc. yourself — only trade and LP against
  Robinhood's issued tokens.
- **KYC / eligibility.** Holders generally must pass Robinhood's eligibility/KYC for **mint/redeem**.
  Secondary DEX trading is more open, **but transfers can still carry allowlist behavior depending on
  the token.** → This is exactly [BLOCKERS.md](./BLOCKERS.md) #1: our RewardVault airdrops stock
  tokens to arbitrary user wallets, so we must confirm on testnet that the chosen reward token
  transfers freely to un-KYC'd wallets. If it doesn't, the claim mechanic needs a redesign.
- **Not 1:1 backing** (see the design-decision section above).
