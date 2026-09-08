import { MorePage } from "@/components/MorePage";

// Changelog — what's shipped and what's next. Keep newest first.
export const metadata = { title: "Changelog — Drip" };

const log = [
  {
    tag: "Now", state: "shipped", items: [
      "Chat — live miner feed with a working composer (guest posting).",
      "More menu — About, Changelog, Explore, Reserve, Rewards, Shield.",
      "Explore — market, mining, staking, supply, activity, revenue & leaderboards.",
    ],
  },
  {
    tag: "Earlier", state: "shipped", items: [
      "Mine — ORE-style 5×5 grid, Lite/Pro, 1% entry fee, 1-or-all, motherlode, refining.",
      "Stake — deposit/withdraw demo for the stakers' slice.",
      "Contracts — GridMine, DripToken, RefiningVault, StakeVault; tested against real USDG on a mainnet fork.",
    ],
  },
  {
    tag: "Next", state: "planned", items: [
      "Secure randomness (VRF or bonded commit–reveal) — the blocker for any real round.",
      "Wallet connect + wire Mine/Stake/Trade to deployed contracts.",
      "Trade — DRIP/USDG swap, scheduled buys & liquidity depth.",
      "Neon-backed chat, persistent identity & on-chain stats indexing.",
    ],
  },
];

export default function ChangelogPage() {
  return (
    <MorePage title="Changelog" subtitle="What's shipped and what's coming.">
      <div className="space-y-6">
        {log.map((g) => (
          <div key={g.tag}>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-white">{g.tag}</span>
              <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                g.state === "shipped" ? "border border-lime/40 bg-lime/10 text-lime" : "border border-yellow-500/40 bg-yellow-500/10 text-yellow-500"
              }`}>{g.state}</span>
            </div>
            <ul className="mt-3 space-y-2">
              {g.items.map((it) => (
                <li key={it} className="flex gap-2.5 text-sm text-mute">
                  <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${g.state === "shipped" ? "bg-lime" : "bg-yellow-500"}`} />
                  <span>{it}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </MorePage>
  );
}
