import { MorePage } from "@/components/MorePage";
import { gridMine } from "@/lib/site";

// Reserve — the pools the game keeps: motherlode jackpot, stakers' vault, refining vault, buyback.
export const metadata = { title: "Reserve — Drip" };

const pools = [
  { name: "Motherlode", value: "26.4 DRIP", note: `Accrues 10% of every cut. A 1/${gridMine.motherlodeOdds} hit dumps the whole jackpot to that round's winners.`, tag: "jackpot" },
  { name: "StakeVault", value: "1.24M DRIP", note: "Holds staked DRIP and streams the stakers' 10% slice of every buyback (Synthetix accumulator).", tag: "staking" },
  { name: "RefiningVault", value: "312K DRIP", note: `Holds winners' bought DRIP until claimed. Claiming taxes ${gridMine.refineFeeBps / 100}% to unclaimed holders.`, tag: "winnings" },
  { name: "Marketing", value: "4,180 USDG", note: `The ${gridMine.adminFeeBps / 100}% entry fee, skimmed at deploy. Permissionless withdraw to the ops wallet.`, tag: "ops" },
];

export default function ReservePage() {
  return (
    <MorePage title="Reserve" subtitle="The pools the grid keeps.">
      <div className="space-y-3">
        {pools.map((p) => (
          <div key={p.name} className="rounded-2xl border border-line bg-panel p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-white">{p.name}</h2>
              <span className="rounded-full border border-line bg-panel2 px-2.5 py-0.5 text-[11px] text-mute">{p.tag}</span>
            </div>
            <div className="mt-1 text-2xl font-semibold text-lime">{p.value}</div>
            <p className="mt-2 text-xs text-mute">{p.note}</p>
          </div>
        ))}
      </div>
      <p className="mt-6 text-center text-[11px] text-mute/60">Demo balances — live pools read on-chain at launch.</p>
    </MorePage>
  );
}
