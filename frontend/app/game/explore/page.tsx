"use client";

import { useState } from "react";
import { MorePage } from "@/components/MorePage";
import { gridMine } from "@/lib/site";

// Explore — ORE-style stats screen. Market / Mining / Staking / Supply / Activity / Revenue +
// leaderboards. Pre-launch: every number is illustrative demo data, clearly labeled. Real figures
// arrive when the game is live on-chain and the indexer (Neon) is wired.

const fmt = (n: number, d = 0) => n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

const MINERS = [
  { a: "dripmaxi", v: 4820 }, { a: "gridwhale", v: 3910 }, { a: "55nF…mqjh", v: 2740 },
  { a: "NotZohran", v: 1980 }, { a: "7ibJ…PU4B", v: 1420 }, { a: "7chh…wC4f", v: 990 },
];
const STAKERS = [
  { a: "gridwhale", v: 51200 }, { a: "diamondrip", v: 38400 }, { a: "5c4R…VHcq", v: 22100 },
  { a: "dripmaxi", v: 17800 }, { a: "H8VM…66bA", v: 9600 }, { a: "8bc6…7rti", v: 5100 },
];
const UNREFINED = [
  { a: "NotZohran", v: 1240 }, { a: "7chh…wC4f", v: 880 }, { a: "gridwhale", v: 610 },
  { a: "HA36…rpMB", v: 430 }, { a: "7wfh…VKse", v: 220 }, { a: "dripmaxi", v: 150 },
];

export default function ExplorePage() {
  const [board, setBoard] = useState<"miners" | "stakers" | "unrefined">("miners");
  const rows = board === "miners" ? MINERS : board === "stakers" ? STAKERS : UNREFINED;
  const unit = board === "stakers" ? "DRIP staked" : board === "unrefined" ? "DRIP unrefined" : "USDG mined";

  return (
    <MorePage title="Explore" subtitle="Live grid stats & leaderboards.">
      <Section title="Market">
        <Grid>
          <Stat label="DRIP price" value="$0.0142" sub="illustrative" />
          <Stat label="24h volume" value="$38.4K" sub="DRIP/USDG" />
          <Stat label="Liquidity" value="$212K" sub="Pons pool" />
          <Stat label="Market cap" value="$142K" sub="circ. × price" />
        </Grid>
      </Section>

      <Section title="Mining">
        <Grid>
          <Stat label="Deployed (24h)" value={`${fmt(184320)} USDG`} sub="across all rounds" />
          <Stat label="Miners (24h)" value="612" sub="unique wallets" />
          <Stat label="Rounds today" value="1,440" sub="~1 / min" />
          <Stat label="Entry fee" value={`${gridMine.adminFeeBps / 100}%`} sub="→ marketing/ops" />
        </Grid>
      </Section>

      <Section title="Staking">
        <Grid>
          <Stat label="APR" value="18.6%" sub="stakers' 10% slice" />
          <Stat label="Staked" value={`${fmt(1.24e6)} DRIP`} sub="in StakeVault" />
          <Stat label="% of supply" value="12.4%" sub="staked / total" />
          <Stat label="Stakers" value="284" sub="wallets" />
        </Grid>
      </Section>

      <Section title="Supply">
        <Grid>
          <Stat label="Total supply" value={`${fmt(1e7)} DRIP`} sub="fixed — never minted" />
          <Stat label="Burned" value={`${fmt(742000)} DRIP`} sub="7.4% · 70% of every cut" />
          <Stat label="Circulating" value={`${fmt(9.26e6)} DRIP`} sub="total − burned" />
          <Stat label="Holders" value="3,180" sub="wallets" />
        </Grid>
      </Section>

      <Section title="Activity (24h)">
        <Grid>
          <Stat label="Solo rounds" value="712" sub="~50% — 1-or-all" />
          <Stat label="Motherlodes hit" value="2" sub={`1 / ${gridMine.motherlodeOdds} odds`} />
          <Stat label="No-winner rounds" value="58" sub="100% burned" />
          <Stat label="Motherlode pool" value={`${fmt(26.4, 1)} DRIP`} sub="current" />
        </Grid>
      </Section>

      <Section title="Revenue (24h, from the 10% cut)">
        <Grid>
          <Stat label="DRIP bought" value={`${fmt(12840)} DRIP`} sub="cut → buyback" />
          <Stat label="Burned" value={`${fmt(8988)} DRIP`} sub="70%" />
          <Stat label="To stakers" value={`${fmt(1284)} DRIP`} sub="10%" />
          <Stat label="To winners" value={`${fmt(2568)} DRIP`} sub="10% win + 10% motherlode" />
        </Grid>
      </Section>

      {/* Leaderboard */}
      <div className="mt-2">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-mute">Leaderboard</h2>
        <div className="inline-flex w-full rounded-full border border-line bg-panel p-1">
          {(["miners", "stakers", "unrefined"] as const).map((b) => (
            <button key={b} onClick={() => setBoard(b)}
              className={`flex-1 rounded-full px-3 py-1.5 text-xs font-semibold capitalize ${board === b ? "bg-white text-ink" : "text-mute"}`}>
              {b}
            </button>
          ))}
        </div>
        <div className="mt-3 divide-y divide-line/60 rounded-2xl border border-line bg-panel">
          {rows.map((r, i) => (
            <div key={r.a} className="flex items-center justify-between px-4 py-2.5 text-sm">
              <span className="flex items-center gap-3">
                <span className={`w-5 text-center text-xs font-bold ${i === 0 ? "text-yellow-500" : i < 3 ? "text-white" : "text-mute"}`}>{i + 1}</span>
                <span className="h-6 w-6 rounded-full" style={{ background: `hsl(${[...r.a].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7)} 70% 60%)` }} />
                <span className="text-white">{r.a}</span>
              </span>
              <span className="font-semibold text-white">{fmt(r.v)}</span>
            </div>
          ))}
          <div className="px-4 py-2 text-center text-[11px] text-mute/60">{unit}</div>
        </div>
      </div>

      <p className="mt-6 text-center text-[11px] text-mute/60">Demo data — real stats index on-chain at launch.</p>
    </MorePage>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-mute">{title}</h2>
      {children}
    </div>
  );
}
function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-2.5">{children}</div>;
}
function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-2xl border border-line bg-panel p-3.5">
      <div className="text-[11px] uppercase tracking-wide text-mute">{label}</div>
      <div className="mt-1.5 text-lg font-semibold text-white">{value}</div>
      <div className="mt-0.5 text-[11px] text-mute">{sub}</div>
    </div>
  );
}
