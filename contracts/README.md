# Contracts

Solidity contracts for Drip, laid out as a [Foundry](https://book.getfoundry.sh/) project.

> **These are skeletons, not audited implementations.** Function bodies are stubbed with `TODO`
> comments referencing the relevant spec section. Do not deploy to mainnet — see
> [`../docs/BLOCKERS.md`](../docs/BLOCKERS.md). All Phase 1–3 work targets **testnet (46630)**.

## Contracts

| File | Role | Phase | Spec |
|---|---|---|---|
| `src/DripToken.sol` | Fair-launch ERC-20. No team allocation. Fee is levied by the hook, **not** in `transfer()`. | 1 | §2.1, §6 |
| `src/hooks/DripFeeHook.sol` | Uniswap v4 hook that takes the 4% on swaps and forwards to `FeeRouter`. | 1 | §2.1 |
| `src/FeeRouter.sol` | Splits the 4% → 1% launchpad / 2% auto-buy buffer / 1% marketing-ops. | 1 | §2.1 |
| `src/ReserveManager.sol` | 50/50 split of stock acquired each cycle; dynamic drawdown on low-volume cycles. | 3 | §3 |
| `src/RewardVault.sol` | Holds Stock Tokens; publishes a per-cycle Merkle root; Merkle claims. | 3 | §2.4 |

Interfaces live in `src/interfaces/`.

## Why the fee is a hook, not `transfer()`

Tax-on-transfer logic inside `transfer()` breaks DEX routers (they revert on unexpected balance
deltas). Robinhood Chain has Uniswap v4, so the clean approach is a **v4 hook** that charges the fee
at swap time. `DripToken` itself stays a standard ERC-20.

## Dependencies (not vendored)

Install with Foundry before implementing:

```bash
forge install foundry-rs/forge-std
forge install OpenZeppelin/openzeppelin-contracts
forge install Uniswap/v4-core Uniswap/v4-periphery
```

`lib/` and build artifacts are gitignored.

## Build / test (once implemented)

```bash
forge build
forge test
forge script script/Deploy.s.sol --rpc-url rhc_testnet --broadcast   # testnet only
```

## Security posture

- Keeper entrypoints must be **permissionless-safe**: idempotent per cycle, slippage-bounded swaps,
  no trust in the caller (see [`../docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md)).
- Merkle-root publication is a trusted action (backend-computed). Consider a challenge window and
  reproducible inputs before a root becomes claimable.
- Professional audit is a **Phase 4 gate** (SPEC §9) before any mainnet deploy.
