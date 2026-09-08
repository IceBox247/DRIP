# Deployment — Vercel + Neon + keys

Everything you need to put Drip live: environment variables, Neon Postgres, the keeper key, and the
Vercel steps. Copy [`../frontend/.env.example`](../frontend/.env.example) to real values in Vercel.

> **The one rule that matters:** anything prefixed `NEXT_PUBLIC_` is **shipped to the browser** —
> put ONLY non-secret values there (chain id, public RPC, contract addresses). Every secret (DB
> URL, private keys, OAuth secrets, session secret) is a **plain** var (no prefix), read only in
> server code (API routes / cron). **Never** put a private key or DB URL behind `NEXT_PUBLIC_`, and
> never commit real values — `.env*` is gitignored.

---

## What actually goes live

- **Frontend** (this `frontend/` Next app on Vercel) — landing, `/game`, `/app`.
- **API routes** (Next route handlers in the same Vercel project) — auth (SIWE + X OAuth), the
  points/referral/task backend, reading/writing **Neon Postgres**.
- **Keeper** (a Vercel Cron hitting a protected API route, or a small external worker) — closes Grid
  Mine rounds, reveals randomness, runs the buyback. This is the piece that needs a **funded key**.
- **Contracts** — deployed separately with Foundry (not by Vercel); their addresses go into the
  `NEXT_PUBLIC_*_ADDRESS` vars.

---

## Environment variables

### Client-safe (`NEXT_PUBLIC_` — shipped to the browser)

| Var | Example | Notes |
|---|---|---|
| `NEXT_PUBLIC_CHAIN_ID` | `4663` | 4663 mainnet, 46630 testnet |
| `NEXT_PUBLIC_RPC_URL` | `https://rpc.mainnet.chain.robinhood.com` | a **public** RPC (fine to expose) |
| `NEXT_PUBLIC_SITE_URL` | `https://drip.xyz` | canonical URL (OAuth redirects, OG) |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | `abc123…` | from WalletConnect Cloud; public by design |
| `NEXT_PUBLIC_USDG_ADDRESS` | `0x5fc5…d168` | deploy asset |
| `NEXT_PUBLIC_DRIP_ADDRESS` | `0x…` | after contract deploy |
| `NEXT_PUBLIC_GRIDMINE_ADDRESS` | `0x…` | after contract deploy |
| `NEXT_PUBLIC_REFINING_ADDRESS` | `0x…` | after contract deploy |
| `NEXT_PUBLIC_STAKE_ADDRESS` | `0x…` | after contract deploy |
| `NEXT_PUBLIC_BUYBACK_ADDRESS` | `0x…` | after contract deploy |

### Server-only secrets (NO prefix — never exposed)

| Var | Example | Notes |
|---|---|---|
| `DATABASE_URL` | `postgresql://user:pass@ep-xxx-pooler.<region>.aws.neon.tech/drip?sslmode=require` | Neon **pooled** connection (runtime) |
| `DIRECT_URL` | `postgresql://user:pass@ep-xxx.<region>.aws.neon.tech/drip?sslmode=require` | Neon **direct** (migrations only) |
| `RPC_URL` | `https://…alchemy.com/v2/<key>` | server RPC with your paid key (keep off the client) |
| `KEEPER_PRIVATE_KEY` | `0x…` | funds/sends keeper txs (close round, reveal, buyback). See **Keeper key** below |
| `CRON_SECRET` | `long-random-string` | shared secret the cron sends; the keeper route rejects anything else |
| `SESSION_SECRET` | `openssl rand -hex 32` | signs auth sessions/JWTs |
| `X_CLIENT_ID` | `…` | X (Twitter) OAuth2 app — task verify + referral attribution |
| `X_CLIENT_SECRET` | `…` | X OAuth2 secret |
| `X_REDIRECT_URI` | `https://drip.xyz/api/auth/x/callback` | must match the X app config |

Add only what a feature actually uses yet — the contracts/auth/DB vars come online as those pieces
are wired. Set the client-safe + DB ones first; that's enough to deploy the site against Neon.

---

## Neon Postgres

1. Create a project at neon.tech → you get a database and a connection string.
2. Neon gives two hosts: a **pooled** one (host contains `-pooler`) and a **direct** one. On Vercel
   (serverless), use the **pooled** URL for `DATABASE_URL` and the **direct** URL for `DIRECT_URL`
   (schema migrations only). Both need `?sslmode=require`.
3. ORM notes: **Prisma** → set `DATABASE_URL` (pooled) + `directUrl = env("DIRECT_URL")` in the
   datasource, and append `&pgbouncer=true&connection_limit=1` to the pooled URL. **Drizzle** → use
   the `@neondatabase/serverless` driver over the pooled URL. Either way, keep connections short —
   serverless functions must not hold pools open.
4. Put both URLs in Vercel as server-only vars (above). Never in `NEXT_PUBLIC_`.

---

## The keeper key (the "real key")

The keeper wallet signs on-chain txs (closing rounds, revealing randomness, triggering buyback). It
is a genuine risk surface, so:

- Use a **dedicated hot wallet** created only for this — never your personal/main wallet, never a
  seed you use elsewhere.
- Fund it with **only** what it needs for gas; top it up, don't park value in it.
- Store it as `KEEPER_PRIVATE_KEY` (server-only) in Vercel. It is read only inside the cron/keeper
  route — never sent to the browser.
- It should hold **no privileged control** over user funds by design (the contracts are built so the
  keeper/anyone can only *poke* permissionless entrypoints; it can't pick winners or seize USDG).
- Better than an env-var key when you can: a managed signer / KMS (e.g. a remote signer service).
  Start with the dedicated hot wallet; plan the upgrade.

Rotate it if it ever touches a log, a screenshot, or a shared screen.

---

## Vercel steps

1. **Import** the GitHub repo. Set **Root Directory = `frontend`** (the Next app lives in a
   subdirectory). Framework preset **Next.js** auto-detects.
2. **Production Branch:** point it at the branch you deploy from (currently
   `claude/drip-platform-spec-qdndrm`), or merge to your default branch — otherwise production won't
   show the latest work.
3. **Environment Variables:** add the vars above. Set them for **Production** (and Preview if you
   want branch deploys to work). Secrets → all environments except don't expose to the browser (only
   `NEXT_PUBLIC_` are).
4. **Cron (keeper):** add a `vercel.json` cron that hits `/api/keeper` on your interval; the route
   checks `CRON_SECRET`. (Vercel Cron minimum granularity is coarse — for ~60s Grid Mine rounds
   you'll likely want an external worker or a self-scheduling function; see keeper/README.md.)
5. **Deploy.** Update the `NEXT_PUBLIC_*_ADDRESS` vars after each contract deploy and redeploy.

---

## Restrictions / access

Stating the restriction in the site details records **intent**; it does not **enforce** anything. If
access is meant to be limited by region, add real enforcement: an edge middleware
(`frontend/middleware.ts`) that geolocates the request (Vercel provides `request.geo`) and blocks
disallowed regions before the page loads, plus the same check server-side on any state-changing API.
The disclaimer and the enforcement are both needed — the text alone isn't the control. This is
separate from, and does not substitute for, the legal steps in [BLOCKERS.md](./BLOCKERS.md).

---

## Contracts deploy (separate from Vercel)

Contracts go on-chain via Foundry, not Vercel:

```bash
cd contracts
export PRIVATE_KEY=0x...            # dedicated deployer key, set at the shell — never committed
export USDG=0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168   # mainnet USDG (or omit on testnet → mock)
forge script script/DeployGame.s.sol --rpc-url <rpc> --broadcast --private-key $PRIVATE_KEY
```

Then copy the printed addresses into the `NEXT_PUBLIC_*_ADDRESS` vars in Vercel.
