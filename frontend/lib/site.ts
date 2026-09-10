// Central copy + tunable display values for the Drip site.
// These mirror docs/SPEC.md and config/constants.example.json. Values marked "target/default" are
// not final — see the spec's open decisions and blockers. Keep marketing copy free of yield/return
// promises (BLOCKERS.md #2).

export const site = {
  name: "Drip",
  ticker: "$DRIP",
  chain: "Robinhood Chain",
  launchpad: "Pons",
  tagline: "Hold DRIP. Mine tokenized stock.",

  // ── Launch state ────────────────────────────────────────────────────────────
  // DRIP is NOT deployed yet. Keep `launched` false until the token is live on Pons,
  // then set `contractAddress` to the REAL deployed address and flip `launched` to true.
  // Never put a placeholder address here that looks real — pre-launch we show a
  // "no CA exists yet, anything claiming one is a scam" notice instead.
  launched: false,
  contractAddress: null as string | null,

  // Do NOT paste real financial figures here unless verified. Use descriptors, not fake stats.
  links: {
    // TODO: replace with real URLs before launch.
    app: "/game", // the old passive-node dashboard is retired; the app is Grid Mine
    game: "/game",
    x: "https://x.com",
    github: "https://github.com/IceBox247/DRIP",
    spec: "https://github.com/IceBox247/DRIP/blob/main/docs/SPEC.md",
    docs: "https://github.com/IceBox247/DRIP/tree/main/docs",
  },
} as const;

// Grid Mine params — MUST mirror the contracts (contracts/src/game/) and config gridMine.
export const gridMine = {
  tiles: 25, // 5×5
  roundSeconds: 60,
  deployAsset: "USDG",
  adminFeeBps: 100, // 1% of gross → marketing/ops
  loserCutBps: 1000, // 10% of loser pot → buys DRIP
  // Split of the 10% cut (fractions of the cut). Most buys DRIP; the winners' slice is now paid
  // 6% as DRIP + 4% as NVDA (bought from the cut). Burn/stakers/motherlode unchanged.
  cutSplitBurnBps: 7000, // 70% → buys DRIP, burned
  cutSplitStakersBps: 1000, // 10% → buys DRIP, to stakers
  cutSplitWinnersBps: 600, // 6% → buys DRIP, to this round's winners
  cutSplitWinnersNvdaBps: 400, // 4% → buys NVDA, to this round's winners (1-or-all)
  cutSplitMotherlodeBps: 1000, // 10% → buys DRIP, to the motherlode
  motherlodeOdds: 625, // 1 / 625
  soloOdds: 2, // 1-or-all: 50% one winner takes the DRIP/NVDA, 50% shared
  refineFeeBps: 1000, // 10% claim tax on DRIP → unclaimed holders
  winnerStockAsset: "NVDA", // tokenized NVIDIA on Robinhood Chain
  nvdaPrice: 176, // demo NVDA price in USDG (display only)
} as const;

export const stats = [
  { value: "0%", label: "team allocation", note: "fair launch — team holds no tokens" },
  { value: "Hourly", label: "reward cycle", note: "auto-buy + distribute every cycle" },
  { value: "^0.75", label: "anti-whale curve", note: "holdings count sub-linearly" },
] as const;

export const steps = [
  {
    n: "01",
    title: "Connect wallet + X",
    body: "Link your wallet and X account to start. Your X connection also attributes referrals.",
  },
  {
    n: "02",
    title: "Run your node",
    body: "Switch on your mining node — a server-side accrual timer. (It's not real mining; nothing runs on your device.)",
  },
  {
    n: "03",
    title: "Earn hash rate",
    body: "Your hash rate grows with how much DRIP you hold, plus boosts from tasks and referrals. Points stream in per second.",
  },
  {
    n: "04",
    title: "Claim real stock",
    body: "Each cycle, the reward pool of tokenized Stock Tokens is split by the points you earned. Claim your share.",
  },
] as const;

export const faqs = [
  {
    q: "Is this real crypto mining?",
    a: "No. The 'node' is a server-side timer that accrues points while it's active. Nothing runs on your hardware and no proof-of-work is involved.",
  },
  {
    q: "Where do the rewards come from?",
    a: "Drip is launched on Pons. Pons collects the trade fee and pays our creator share in USDG. That USDG is used to buy tokenized Stock Tokens each cycle, which are distributed to active miners by points earned.",
  },
  {
    q: "Do big holders take everything?",
    a: "Holdings count sub-linearly (raised to the 0.75 power), so larger holders earn more but not proportionally more. Everyone with an active node earns a base rate too.",
  },
  {
    q: "Does the team hold tokens?",
    a: "No. It's a fair launch with no team or founder allocation.",
  },
  {
    q: "What keeps rewards flowing on quiet days?",
    a: "A reserve buffer. Half of each cycle's acquired stock goes to a reserve; on low-volume cycles the system draws from it at a rate tuned to reserve health, so payouts don't stop.",
  },
] as const;
