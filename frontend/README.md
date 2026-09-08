# Drip — web (Next.js)

Marketing site + app shell for Drip ($DRIP). **Next.js 14 (App Router) + TypeScript + Tailwind.**
Deploys to Vercel with zero config.

## Routes

| Route | What it is | Status |
|---|---|---|
| `/` | Landing page — concept, how it works, rewards engine, referrals, tasks, fee flow, FAQ | Live |
| `/app` | Dashboard **shell** — connect wallet/X, hash rate, claimable, referral link | Preview (static placeholders) |

The dashboard is intentionally a static preview: live wallet-connect, X OAuth, and real points/claims
are **Phase 2** and need the backend (see [`../docs/ROADMAP.md`](../docs/ROADMAP.md)). Buttons that
require the backend are disabled and labeled.

## Local development

```bash
cd frontend
npm install
npm run dev      # http://localhost:3000
```

```bash
npm run build    # production build
npm start        # serve the production build
```

## Deploy on Vercel

Because this app lives in the `frontend/` subdirectory, point Vercel at it:

**Option A — dashboard (recommended):**
1. Import the GitHub repo `IceBox247/DRIP` into Vercel.
2. Set **Root Directory** to `frontend`.
3. Framework preset **Next.js** is auto-detected — Build `next build`, Output handled automatically.
4. Deploy. (Set any env vars under Project → Settings → Environment Variables.)

**Option B — CLI:**
```bash
npm i -g vercel
cd frontend
vercel            # first run links/creates the project
vercel --prod     # production deploy
```

## Editing content

Copy and display values live in [`lib/site.ts`](./lib/site.ts) (site name, links, stats, steps,
FAQs). Update links there — the `github`, `x`, and `spec` URLs are placeholders. The reward numbers
shown mirror [`../config/constants.example.json`](../config/constants.example.json) and
[`../docs/SPEC.md`](../docs/SPEC.md); they are defaults/targets, not final.

## Compliance note

Marketing copy deliberately avoids yield/return/profit promises, and the footer carries a
not-advice + no-US-persons + geo-restriction notice (see [`../docs/BLOCKERS.md`](../docs/BLOCKERS.md)
#2). Keep that posture when editing. Real geoblocking must be enforced server-side before launch —
the footer notice is not a substitute.
