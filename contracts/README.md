# Contracts

Solidity contracts for Drip, laid out as a [Foundry](https://book.getfoundry.sh/) project.

> **These are skeletons, not audited implementations.** Function bodies are stubbed with `TODO`
> comments referencing the relevant spec section. Do not deploy to mainnet — see
> [`../docs/BLOCKERS.md`](../docs/BLOCKERS.md). All Phase 1–3 work targets **testnet (46630)**.

## Contracts

| File | Role | Phase | Spec |
|---|---|---|---|
| `src/DripToken.sol` | Plain fair-launch ERC-20. **No fee logic.** May be Pons-deployed. | 1 | §2.1, §6 |
| `src/FeeDistributor.sol` | Splits the **USDG creator fees received from Pons** → ~2/3 auto-buy / ~1/3 marketing. Optional on-chain; can be done in the keeper. | 1 | §2.1 |
| `src/ReserveManager.sol` | 50/50 split of stock acquired each cycle; dynamic drawdown on low-volume cycles. | 3 | §3 |
| `src/RewardVault.sol` | Holds Stock Tokens; publishes a per-cycle Merkle root; Merkle claims. | 3 | §2.4 |

Interfaces live in `src/interfaces/`.

## We do NOT collect the fee — there is no hook

**Pons** collects the trade fee on DRIP, keeps its protocol cut, and pays our creator share **in
USDG** to a payout wallet we designate (see [`../docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md)). So
there is **no Uniswap v4 hook and no tax-on-transfer** in this repo — an earlier `DripFeeHook` was
removed. `DripToken` is a plain ERC-20 (which Pons may even deploy for us). Our contracts start at
the *distribution* of the USDG we've already received. The split itself is **optional on-chain**:
`FeeDistributor` gives a transparent, verifiable version, but the keeper can move the USDG directly.

The Pons-specific fee-receipt logic (push automation vs. pull claim) lives in `keeper/`, not here,
so these contracts stay launchpad-agnostic — they just see "USDG in, Stock Token out."

## Dependencies (not vendored)

Install with Foundry before implementing:

```bash
forge install foundry-rs/forge-std
forge install OpenZeppelin/openzeppelin-contracts
# No Uniswap v4 hook dependency — Pons collects the fee. A DEX router/quoter may still be needed for
# the keeper's USDG -> Stock Token swap, wired from the keeper side.
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
