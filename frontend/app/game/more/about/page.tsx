import Link from "next/link";
import { MorePage } from "@/components/MorePage";
import { site, gridMine } from "@/lib/site";

// About — what Grid Mine is, in plain language.
export const metadata = { title: "About — Drip" };

export default function AboutPage() {
  return (
    <MorePage title="About" subtitle={site.tagline}>
      <div className="space-y-4 text-sm leading-relaxed text-mute">
        <p>
          <span className="font-semibold text-white">Grid Mine</span> is a fast on-chain game for
          <span className="text-white"> {site.ticker}</span> on {site.chain}, launched via the{" "}
          <span className="text-white">{site.launchpad}</span> launchpad. It adapts ORE&rsquo;s 5×5 grid: every
          round you deploy USDG onto tiles, a secure RNG picks one winning tile, and the losing stake is
          redistributed to the winners.
        </p>
        <div className="rounded-2xl border border-line bg-panel p-4 text-white">
          <div className="grid grid-cols-2 gap-y-3 text-sm">
            <Fact label="Grid" value={`5×5 · ${gridMine.tiles} tiles`} />
            <Fact label="Round" value={`${gridMine.roundSeconds}s`} />
            <Fact label="Deploy asset" value={gridMine.deployAsset} />
            <Fact label="Winner odds" value={`1 / ${gridMine.tiles} per tile`} />
            <Fact label="Winners get" value="90% of loser pot (USDG)" />
            <Fact label="Cut" value={`${gridMine.loserCutBps / 100}% → buys DRIP`} />
          </div>
        </div>
        <p>
          The 10% cut buys DRIP from the pool and splits it {gridMine.cutSplitBurnBps / 100}% burn /
          {" "}{gridMine.cutSplitStakersBps / 100}% stakers / {gridMine.cutSplitWinnersBps / 100}% winners /
          {" "}{gridMine.cutSplitMotherlodeBps / 100}% motherlode. DRIP is fixed-supply — the game never mints; it
          only buys. See <Link href="/game/more/rewards" className="text-lime hover:underline">Rewards</Link> for the
          full breakdown and <Link href="/game/more/shield" className="text-lime hover:underline">Shield</Link> for
          the fair-play guarantees.
        </p>
        <p className="rounded-2xl border border-line bg-panel/60 p-4 text-xs">
          This app is a <span className="text-white">pre-launch demo</span> — fake funds, no chain. It&rsquo;s a
          real-money game of chance by design; nothing runs on mainnet until secure randomness and legal review are
          done.
        </p>
        <div className="flex gap-3 pt-1">
          <a href={site.links.github} target="_blank" rel="noreferrer" className="flex-1 rounded-xl border border-line bg-panel py-2.5 text-center text-sm font-semibold text-white hover:border-mute/50">GitHub</a>
          <a href={site.links.docs} target="_blank" rel="noreferrer" className="flex-1 rounded-xl border border-line bg-panel py-2.5 text-center text-sm font-semibold text-white hover:border-mute/50">Docs</a>
        </div>
      </div>
    </MorePage>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-mute">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}
