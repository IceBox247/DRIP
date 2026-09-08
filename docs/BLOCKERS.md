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

## Dependency 3 — Launchpad fee access (confirm before Phase 1)

The whole reward engine assumes the launchpad **delivers our share of the 4% fee** to us. We build
no fee-collection mechanism of our own; if the fee never actually reaches a wallet we can spend
from, there is nothing to convert into Stock Tokens.

**Confirm with the launchpad:**

- [ ] The launchpad routes our share of the trade fee to a wallet we control (**push**), or grants
      us withdraw rights on its fee wallet (**pull**). (DECISIONS.md #5a)
- [ ] Whether we receive the net 3% (launchpad keeps its 1%) or the gross 4%. (DECISIONS.md #5b)
- [ ] The token the fee is paid in (DRIP? the pair's quote token? stablecoin?) — affects the swap
      path to the Stock Token.
- [ ] Delivery cadence / claim mechanics (continuous, or claimable in batches).
- [ ] Test the full receive → distribute path on **testnet (46630)** with the real launchpad
      integration (or a faithful mock) before Phase 3.

**Status:** ⛔ Not confirmed. Less severe than #1/#2 (the user reports the launchpad does provide
the fee), but it is a hard dependency for the fee engine and must be verified, not assumed.

## Gate policy

Phase 3 (reward engine) code may be **written and tested on testnet** as scaffolding, but:

- No mainnet deploy of the reward/claim path while Blocker 1 is unverified.
- No public launch, marketing, or reward promises while Blocker 2 is uncleared.
