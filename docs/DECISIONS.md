# Open Decisions

These are the SPEC §7 items that **must be resolved before Phase 1** contract implementation.
Update the Status/Resolution as each is decided; nothing downstream should hard-code a value
that contradicts an unresolved decision here.

| # | Decision | Default | Status | Resolution |
|---|---|---|---|---|
| 1 | **Ops funding** — does the marketing 1% double as ops treasury, or add a dedicated ops slice? Servers, audit (5-figure), legal, and X API all cost money and the team holds no tokens. | Marketing 1% doubles as ops | ❓ Open | — |
| 2 | **Points unit name** — the in-app earning unit ("hash/points") needs a canonical name for UI + code. | `points` (placeholder) | ❓ Open | — |
| 3 | **Which Stock Token(s)** does the auto-buy purchase (with our netted USDG) — one liquid ETF-style token, or a basket? | Single liquid ETF-style token | ❓ Open | — |
| 4 | **Referral depth** — single-level or multi-level? | Single level | ❓ Open | — |
| 5 | **Pons fee config** — total trade fee, creator/protocol split, currency, delivery. | Net ~3% to creator, USDG, push via Pons automation | 🔬 Decided-pending-verify | Launchpad = **Pons**. Deliver creator fees in **USDG** to our payout wallet via **push** automation; **net** (Pons keeps its cut). Target **~3% of volume net** to creator → needs a high per-launch fee (default nets ~0.7%). Verify on-chain params (immutable at launch) + volume impact. |
| 6 | **Who deploys DRIP** — Pons deploys it as part of the launch, or we deploy a plain ERC-20 and list it? | Confirm with Pons | ❓ Open | — |
| 7 | **DRIP's liquidity pair** — what does DRIP trade against? `DRIP/USDG` (stable market; rewards come purely from fees buying stock) vs. `DRIP/<stock>` paired-against-RWA (DRIP priced in a stock, Long/Bankr style). Determines what Pons can launch for us. | `DRIP/USDG` (matches current reward model) | ❓ Open | See docs/ROBINHOOD-CHAIN.md "Two ways DRIP can relate to stock tokens". |
| 8 | **Grid Mine: ship it, and replace or complement?** Add the ORE-style game (GRID-MINE.md) as a second mode alongside the passive hold-earn-stock model, replace the passive model with it, or don't ship it. Changes the whole product framing + legal surface. | Undecided — resolve before building game logic | ❓ Open | Complement = securities **and** gambling exposure. See GRID-MINE.md + BLOCKERS #4. |
| 9 | **Grid Mine randomness** — Chainlink VRF (verify a coordinator is deployed on Robinhood Chain) vs. bonded commit–reveal. | Commit–reveal (no external dep) until VRF confirmed | ❓ Open | Winner must be unpredictable + un-riggable. Never blockhash/timestamp alone. |
| 10 | **Grid Mine deploy asset** — what players stake: USDG, WETH, or a stock token (NVDA/SPY). | USDG | ❓ Open | Stock-token stakes re-invoke BLOCKERS #1 transferability. |

## Notes

- **#1 Ops funding.** If marketing 1% must cover servers + audit + legal + X API, model the burn
  rate against expected volume before committing. A dedicated ops slice changes the fee table in
  SPEC §2.1 and `config/constants.example.json` — do not change the 4% total without re-checking
  launchpad requirements.
- **#3 Stock Token choice** is coupled to [BLOCKERS.md](./BLOCKERS.md) #1 (transferability). Verify
  the chosen token is freely transferable to arbitrary wallets *before* locking it in.
- **#4 Referral depth.** Multi-level increases Ponzi-optics and legal risk (see BLOCKERS #2). The
  default (single level) is the conservative choice; changing it needs legal sign-off.
- **#5 Pons fee config.** ⚠️ The big one. Pons's default is ~1% total / ~70% creator (~0.7% of
  volume) — **not** 3%. Netting ~3% requires configuring a high total trade fee at launch (~4.3%+),
  which is **locked forever** and suppresses volume. Before committing: confirm on-chain that Pons
  allows a fee this high, read the exact per-launch split, confirm the currency (USDG — Robinhood
  Chain's stablecoin), and
  model the volume hit. Delivery is **push** (Pons automation → payout wallet), so the keeper needs
  no privileged keys and `FeeDistributor` never forwards anything back (net). See BLOCKERS #3.
- **#6 Who deploys DRIP.** If Pons deploys the token, `contracts/src/DripToken.sol` becomes a
  reference rather than a deployed artifact, and Phase 1 shrinks to the fee-distribution path.

Legend: ❓ Open · 🔬 Investigating · ✅ Resolved · ⛔ Blocked
