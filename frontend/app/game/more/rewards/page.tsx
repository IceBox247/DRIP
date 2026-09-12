import { MorePage } from "@/components/MorePage";
import { gridMine } from "@/lib/site";

// Rewards — where each round's value goes. Mirrors docs/GRID-MINE.md and GridMine.sol.
export const metadata = { title: "Rewards — Drip" };

const drip = [
  { pct: gridMine.cutSplitBurnBps / 100, label: "Burned (DRIP)", note: "deflationary — helps every holder", color: "bg-red-400" },
  { pct: gridMine.cutSplitStakersBps / 100, label: "Stakers (DRIP)", note: "StakeVault — stake DRIP to earn it", color: "bg-lime" },
  { pct: gridMine.cutSplitMotherlodeBps / 100, label: "Motherlode (DRIP)", note: `motherlode — 1/${gridMine.motherlodeOdds} dumps to the dig's miners`, color: "bg-yellow-500" },
  { pct: gridMine.cutSplitWinnersBps / 100, label: "Winners — DRIP", note: "this round's winners (1-or-all, via refining)", color: "bg-cyan-400" },
  { pct: gridMine.cutSplitWinnersNvdaBps / 100, label: "Winners — NVDA", note: "buys tokenized NVIDIA for winners (1-or-all)", color: "bg-violet-400" },
];

export default function RewardsPage() {
  return (
    <MorePage title="Rewards" subtitle="Where every round's value goes.">
      <div className="space-y-4">
        <Card title="The loser pot (USDG)">
          <Split rows={[
            { pct: 90, label: "Winners", note: "pro-rata by stake on the winning block — always", color: "bg-lime" },
            { pct: gridMine.loserCutBps / 100, label: "Protocol cut", note: "buys DRIP from the pool → split below", color: "bg-violet-400" },
          ]} />
          <p className="mt-3 text-xs text-mute">
            A flat {gridMine.adminFeeBps / 100}% entry fee is skimmed at deploy, before funds enter the pool — it never
            touches the win/loss math.
          </p>
        </Card>

        <Card title="The 10% cut, split">
          <Split rows={drip} />
          <p className="mt-3 text-xs text-mute">
            Most of the cut buys DRIP (fixed-supply, never minted — every reward is
            <span className="text-white"> bought</span> from the market). The winners&rsquo; 4% slice buys{" "}
            <span className="text-white">NVDA</span> (tokenized NVIDIA) instead, so each round pays winners in both
            DRIP and stock.
          </p>
        </Card>

        <Card title="1-or-all">
          <p className="text-sm text-mute">
            The USDG pot is <span className="text-white">always</span> pro-rata. The round&rsquo;s DRIP and NVDA flip a
            coin together: <span className="text-white">50%</span> one weighted winner takes it all (incl. the
            motherlode), <span className="text-white">50%</span> everyone on the block shares.
          </p>
        </Card>

        <Card title="Refining (claim tax)">
          <p className="text-sm text-mute">
            Won DRIP sits in the RefiningVault. Claiming costs <span className="text-white">{gridMine.refineFeeBps / 100}%</span>,
            redistributed to holders who haven&rsquo;t claimed — fast sellers subsidize diamond hands.
          </p>
        </Card>

        <Card title="No-winner rounds">
          <p className="text-sm text-mute">
            If the RNG lands on a block nobody staked, the entire net pool buys DRIP and
            <span className="text-white"> 100% is burned</span>. Nothing is stranded, nothing goes to the team.
          </p>
        </Card>
      </div>
    </MorePage>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-panel p-4">
      <h2 className="text-sm font-semibold text-white">{title}</h2>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function Split({ rows }: { rows: { pct: number; label: string; note: string; color: string }[] }) {
  return (
    <>
      <div className="flex h-2.5 overflow-hidden rounded-full">
        {rows.map((r) => <div key={r.label} className={r.color} style={{ width: `${r.pct}%` }} />)}
      </div>
      <div className="mt-3 space-y-2">
        {rows.map((r) => (
          <div key={r.label} className="flex items-start gap-2.5 text-sm">
            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${r.color}`} />
            <span className="flex-1">
              <span className="font-semibold text-white">{r.pct}% {r.label}</span>
              <span className="block text-xs text-mute">{r.note}</span>
            </span>
          </div>
        ))}
      </div>
    </>
  );
}
