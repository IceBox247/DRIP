# Open Decisions

These are the SPEC §7 items that **must be resolved before Phase 1** contract implementation.
Update the Status/Resolution as each is decided; nothing downstream should hard-code a value
that contradicts an unresolved decision here.

| # | Decision | Default | Status | Resolution |
|---|---|---|---|---|
| 1 | **Ops funding** — does the marketing 1% double as ops treasury, or add a dedicated ops slice? Servers, audit (5-figure), legal, and X API all cost money and the team holds no tokens. | Marketing 1% doubles as ops | ❓ Open | — |
| 2 | **Points unit name** — the in-app earning unit ("hash/points") needs a canonical name for UI + code. | `points` (placeholder) | ❓ Open | — |
| 3 | **Which Stock Token(s)** does the 2% auto-buy purchase — one liquid ETF-style token, or a basket? | Single liquid ETF-style token | ❓ Open | — |
| 4 | **Referral depth** — single-level or multi-level? | Single level | ❓ Open | — |

## Notes

- **#1 Ops funding.** If marketing 1% must cover servers + audit + legal + X API, model the burn
  rate against expected volume before committing. A dedicated ops slice changes the fee table in
  SPEC §2.1 and `config/constants.example.json` — do not change the 4% total without re-checking
  launchpad requirements.
- **#3 Stock Token choice** is coupled to [BLOCKERS.md](./BLOCKERS.md) #1 (transferability). Verify
  the chosen token is freely transferable to arbitrary wallets *before* locking it in.
- **#4 Referral depth.** Multi-level increases Ponzi-optics and legal risk (see BLOCKERS #2). The
  default (single level) is the conservative choice; changing it needs legal sign-off.

Legend: ❓ Open · 🔬 Investigating · ✅ Resolved · ⛔ Blocked
