# Roadmap

Build order from SPEC §9. Each phase gates the next.

## Phase 0 — Legal + tokenomics + ops funding *(do first)*

- [ ] Resolve open decisions ([DECISIONS.md](./DECISIONS.md) #1–#4).
- [ ] Clear / plan around blockers ([BLOCKERS.md](./BLOCKERS.md) #1 transferability, #2 legal).
- [ ] Finalize tokenomics: `TOTAL_SUPPLY`, fee slices, ops funding model.
- [ ] Engage securities counsel; decide offshore structure + US geoblock.

**Exit gate:** decisions resolved, legal path defined, constants locked in
`config/constants.json`.

## Phase 1 — Contracts on testnet (46630)

> Pons collects the trade fee — we do **not** build a fee hook or tax-on-transfer. Phase 1 is about
> confirming Pons's fee economics + delivery and distributing the ETH we net.

- [ ] Confirm Pons fee params on-chain: total fee, creator/protocol split, currency (ETH), and that
      a fee high enough to net ~3% is allowed + worth the volume hit (DECISIONS.md #5, BLOCKERS #3).
- [ ] Enable Pons automation → route creator fees (ETH) to our payout wallet (push).
- [ ] Confirm who deploys DRIP — Pons or us (DECISIONS.md #6). If us: `DripToken` (plain ERC-20,
      fair launch, no team allocation).
- [ ] `FeeDistributor` (split received ETH → ~2/3 auto-buy / ~1/3 marketing), **or** decide to do
      the split off-chain in the keeper.
- [ ] Fee-source adapter (Pons push-read / pull-claim) isolated in `keeper/`.
- [ ] Integration-test the fee-receipt → split path on testnet against Pons (or a faithful mock).

**Exit gate:** Pons fee economics + delivery confirmed; our ETH share is received and split correctly
on testnet.

## Phase 2 — Backend + app

- [ ] Accounts, wallet connect + X OAuth.
- [ ] Node timer (server-side accrual — **not** real mining).
- [ ] Hash-rate calc + per-second points ledger (streamed, not snapshot-at-claim).
- [ ] Task verification (X API — see cost flag in SPEC §5).
- [ ] Referral graph + anti-abuse (sybil, X-account minimums, one-per-pair).
- [ ] Frontend: node dashboard, hash rate, claimable stock, referral link, task list.

**Exit gate:** points accrue correctly; referral attribution + task boosts working; app usable.

## Phase 3 — Reward engine

- [ ] Keeper (Gelato / Chainlink Automation) hourly trigger.
- [ ] Auto-buy: swap the auto-buy ETH → Stock Token(s) (slippage-bounded).
- [ ] `ReserveManager`: 50/50 split + dynamic drawdown (SPEC §3 table).
- [ ] `RewardVault`: hold Stock Tokens, publish Merkle root per cycle, Merkle claim.
- [ ] Backend: per-cycle allocation → Merkle root pipeline.

**Exit gate (⛔ blocked by BLOCKERS #1):** end-to-end reward flow on testnet; Stock Token
transferability confirmed.

## Phase 4 — Audit → mainnet → launch

- [ ] Professional smart-contract audit (5-figure, non-negotiable).
- [ ] Address audit findings.
- [ ] Mainnet deploy (4663) — **gated by BLOCKERS #2 legal clearance.**
- [ ] Launchpad listing → seed liquidity → marketing.

**Exit gate:** audited, legally cleared, deployed, liquid.
