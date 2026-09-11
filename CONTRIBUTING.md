# Contributing to Drip

Thanks for your interest in Drip / Grid Mine. This document covers how to build, test, and submit
changes.

## Getting started

```bash
# Contracts (Foundry)
cd contracts
forge build
forge test

# Frontend (Next.js)
cd frontend
npm install
npm run dev        # http://localhost:3000
npx tsc --noEmit   # typecheck
npm run lint
```

Contract dependencies (`contracts/lib/`) are gitignored; CI fetches the pinned versions
(forge-std, OpenZeppelin v5). Install them locally the same way, or with `forge install`.

## Ground rules

- **Every change to `contracts/` must keep `forge test` green.** Add tests for new behavior.
- **Every change to `frontend/` must pass `npx tsc --noEmit` and `npm run lint`.**
- Match the style and comment density of the surrounding code.
- Keep pull requests focused; describe what changed and why.
- Never commit private keys, `.env` files, or secrets. Deploy/keeper keys belong in Vercel/CI
  secrets only, and only in dedicated hot wallets.

## Safety

Grid Mine is a real-money game of chance with on-chain swaps. Changes touching the reward math,
randomness, or the swap adapter get extra scrutiny — see [`docs/BLOCKERS.md`](./docs/BLOCKERS.md).
Anything unaudited stays on testnet or controlled mainnet testing until reviewed.

## Reporting bugs

Open an issue with steps to reproduce. For security-sensitive reports, see [`SECURITY.md`](./SECURITY.md).
