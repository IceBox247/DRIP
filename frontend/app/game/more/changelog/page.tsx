import { MorePage } from "@/components/MorePage";

// Changelog — what's shipped and what's next. Keep newest first.
export const metadata = { title: "Changelog — Drip" };

const log = [
  {
    tag: "Now", state: "shipped", items: [
      "Live on Robinhood testnet — GridMine, DripToken, RefiningVault, StakeVault + mock USDG/NVDA deployed.",
      "Wallet connect — real wagmi picker (browser wallet + WalletConnect); shows your address.",
      "Faucet + live balances — mint test USDG and see your on-chain USDG/DRIP update in the app.",
      "Keeper — a per-minute Vercel cron closes rounds and processes rewards on-chain.",
      "Chat — live miner feed backed by Neon; each browser/wallet has its own identity and messages persist.",
    ],
  },
  {
    tag: "Earlier", state: "shipped", items: [
      "Winners earn NVDA + DRIP — the winners' cut is paid 6% DRIP + 4% tokenized NVIDIA (1-or-all).",
      "Explore — market, mining, staking, supply, plus Activity (rounds/motherlodes) & Revenue tables + leaderboards.",
      "Mine — ORE-style 5×5 grid, Lite/Pro, editable amount, 1% entry fee, 1-or-all, motherlode, refining; wait-for-miner + auto next round.",
      "Stake & Trade — deposit/withdraw and swap screens.",
      "More menu — About, Changelog, Explore, Reserve, Rewards, Shield.",
      "Contracts tested end-to-end against real USDG on a mainnet fork.",
    ],
  },
  {
    tag: "Next", state: "planned", items: [
      "Wire Mine / Stake / Trade buttons to the deployed contracts (deposit, harvest, stake, swap).",
      "Secure randomness (VRF or bonded commit–reveal) — the blocker before any mainnet round.",
      "Trade — real DRIP/USDG swap, scheduled buys & liquidity depth.",
      "On-chain stats indexing so Explore shows real rounds, revenue & leaderboards.",
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
