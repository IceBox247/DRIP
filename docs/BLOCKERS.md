# ⚠️ Blockers — must clear before building the reward layer

These are SPEC §8 items. Either one, unresolved, can **invalidate the reward design**. Treat both
as hard gates on Phase 3 (reward engine) and on any mainnet launch.

---

## Blocker 1 — Stock Token transferability (VERIFY FIRST)

The entire reward payout depends on transferring Stock Tokens to **arbitrary user wallets**. Stock
Tokens were **whitelist-gated** early on.

**Gate:** Confirm on-chain that the target Stock Token is freely transferable before building the
`RewardVault` / claim layer.

**Verification checklist:**

- [ ] Identify the exact Stock Token contract address(es) on Robinhood Chain (couples to
      [DECISIONS.md](./DECISIONS.md) #3).
- [ ] Read the token contract: is there a transfer allowlist / whitelist / pause / KYC gate?
- [ ] Test transfer to a fresh, un-whitelisted EOA on **testnet (46630)**. Does it succeed?
- [ ] Confirm the `RewardVault` contract itself can hold and send the token (contracts sometimes
      blocked separately from EOAs).
- [ ] If restricted: design a wrapper, or pick a different reward asset. **Do not proceed on the
      current design until this is answered.**

**Status:** ⛔ Not verified.

---

## Blocker 2 — Legal / securities exposure

A token people buy **plus** a promise of stock-token rewards for holding/tasking is close to the
textbook definition of an **investment contract** (securities exposure). Stock Tokens are
**blocked for US persons**.

> This repository is engineering scaffolding, **not legal advice.**

**Required before launch:**

- [ ] Engage qualified securities counsel (offshore structuring).
- [ ] US-person geoblocking on the frontend/backend (IP + connected-account signals).
- [ ] Review referral mechanics (SPEC §4) for Ponzi-optics; multi-level depth increases risk.
- [ ] Review reward-marketing language (no yield/return promises).
- [ ] Confirm compliance posture for every jurisdiction where the app is reachable.

**Status:** ⛔ Not cleared. No mainnet launch, no public reward promises, until counsel signs off.

---

## Dependency 3 — Pons fee economics (confirm on-chain before Phase 1)

Launchpad is **Pons** (Robinhood Chain). The whole reward engine is funded by the **creator fees
Pons pays us in USDG**. We build no fee collection of our own. Two things must be checked, because
public sources conflict and Pons fee params are **immutable once set at launch**:

**Confirm against Pons docs + on-chain:**

- [ ] **Fee size.** Pons's cited default is **~1% total / ~70% creator ≈ 0.7% of volume** — NOT 3%.
      Netting our ~3% target needs a high total trade fee configured at launch (~4.3%+). Confirm Pons
      permits a fee that high and that it's worth the volume suppression. (DECISIONS.md #5)
- [ ] **Split & immutability.** Read the exact creator/protocol split for our launch; it is
      snapshotted at launch and can never change. Get it right the first time.
- [ ] **Currency.** Creator fees are paid in **USDG** (Global Dollar, Robinhood Chain's ERC-20
      stablecoin) — confirm for our launch. Fixes the keeper's swap path (USDG → Stock Token).
- [ ] **Delivery.** Confirm Pons **automation can route creator fees to a payout wallet we
      designate** (push, no keys), vs. needing a manual/claim call (pull).
- [ ] **Cadence.** Confirm claim/settlement cadence (Pons runs a per-token vault ~every 5 min).
- [ ] Test the full receive → distribute → swap path on **testnet (46630)** against Pons (or a
      faithful mock) before Phase 3.

**Status:** ⛔ Not confirmed on-chain. The fee *mechanism* exists (Pons pays creators), but the
**economics (fee size vs. the 3% target) are the open risk** and are locked at launch — verify, do
not assume.

## Gate policy

Phase 3 (reward engine) code may be **written and tested on testnet** as scaffolding, but:

- No mainnet deploy of the reward/claim path while Blocker 1 is unverified.
- No public launch, marketing, or reward promises while Blocker 2 is uncleared.
