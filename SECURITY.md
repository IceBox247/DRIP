# Security Policy

## Scope

Drip / Grid Mine is a real-money on-chain game. The most sensitive areas are:

- The round math and payouts in `contracts/src/game/GridMine.sol`
- The randomness source `contracts/src/game/CommitRevealRandomness.sol`
- The swap routing in `contracts/src/game/PonsSwapAdapter.sol`

## Status

The contracts are **not yet audited**. The commit–reveal randomness and the swap adapter are
real-money security primitives and must be audited before a public launch. Until then, deployment is
limited to testnet and controlled mainnet testing (see [`docs/BLOCKERS.md`](./docs/BLOCKERS.md)).

## Reporting a vulnerability

Please report vulnerabilities privately rather than opening a public issue. Include:

- A description of the issue and its impact
- Steps or a proof-of-concept to reproduce
- The affected contract/file and, if known, a suggested fix

Reach out via the project's X account [@Drip_Robinhood](https://x.com/Drip_Robinhood) with a request
for a private channel. We aim to acknowledge reports promptly and will credit reporters who wish to be
named once a fix ships.

## Please do not

- Exploit a vulnerability beyond what is needed to demonstrate it
- Access, modify, or destroy data that isn't yours
- Run automated attacks that degrade the service for others
