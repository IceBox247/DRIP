"use client";

import { useState } from "react";
import { MorePage } from "@/components/MorePage";
import { contractsReady } from "@/lib/contracts";
import { compact } from "@/lib/format";
import { gridMine } from "@/lib/site";
import { useExploreStats } from "@/lib/useExploreStats";

// Explore — REAL grid stats read on-chain. Live figures (rounds, motherlode, staked, supply) are
// direct reads; recent mining activity and the miners leaderboard come from a bounded scan of the
// contract's Deployed events. Deeper all-time analytics (24h $ volume, holders, all-time burn, $
// revenue) need a dedicated indexer and are intentionally omitted rather than faked.

const fmt = (n: number, d = 0) => n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export default function ExplorePage() {
  const s = useExploreStats(contractsReady);
  const [act, setAct] = useState<"rounds" | "motherlodes">("rounds");
  const rows = act === "rounds" ? s.activity : s.motherlodes;

  return (
    <MorePage title="Explore" subtitle="Live grid stats & leaderboards — on-chain.">
      <Section title="Overview">
        <Grid>
          <Stat label="Rounds settled" value={fmt(s.roundsSettled)} sub="all-time" />
          <Stat label="Motherlode pool" value={`${compact(s.motherlode)} DRIP`} sub="current jackpot" />
          <Stat label="Entry fee" value={`${gridMine.adminFeeBps / 100}%`} sub="→ marketing/ops" />
          <Stat label="DRIP supply" value={`${compact(s.totalSupply)} DRIP`} sub="fixed — never minted" />
        </Grid>
      </Section>

      <Section title="Mining (recent)">
        <Grid>
          <Stat label="Deployed" value={`${compact(s.deployedWindow)} USDG`} sub="recent on-chain window" />
          <Stat label="Unique miners" value={fmt(s.uniqueMiners)} sub="recent wallets" />
          <Stat label="Total staked" value={`${compact(s.totalStaked)} DRIP`} sub="in StakeVault" />
          <Stat label="Solo odds" value={`1 / ${gridMine.soloOdds}`} sub="1-or-all" />
        </Grid>
      </Section>

      {/* Activity — real recent settled rounds. */}
      <div className="mb-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-mute">Activity</h2>
          <div className="inline-flex rounded-full border border-line bg-panel p-0.5">
            {(["rounds", "motherlodes"] as const).map((t) => (
              <button key={t} onClick={() => setAct(t)}
                className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${act === t ? "bg-white text-ink" : "text-mute"}`}>
                {t}
              </button>
            ))}
          </div>
        </div>
        <p className="mb-3 text-xs text-mute">
          {act === "rounds" ? "Recent settled rounds on-chain." : "Recent rounds where the motherlode hit."}
        </p>
        <div className="overflow-x-auto rounded-2xl border border-line bg-panel">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead>
              <tr className="border-b border-line/60 text-[11px] uppercase tracking-wide text-mute">
                <th className="px-3 py-2.5 font-medium">Round</th>
                <th className="px-3 py-2.5 font-medium">Tile</th>
                <th className="px-3 py-2.5 font-medium">Type</th>
                <th className="px-3 py-2.5 text-right font-medium">Pool</th>
                <th className="px-3 py-2.5 text-right font-medium">Winners</th>
                <th className="px-3 py-2.5 text-right font-medium">DRIP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/40">
              {rows.length === 0 ? (
                <tr><td colSpan={6} className="px-3 py-6 text-center text-mute">{s.loading ? "Loading…" : "No settled rounds yet."}</td></tr>
              ) : rows.map((row) => (
                <tr key={row.round} className="text-white/90">
                  <td className="whitespace-nowrap px-3 py-2.5 font-mono text-mute">#{fmt(row.round)}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-mute">#{row.winningTile}</td>
                  <td className="whitespace-nowrap px-3 py-2.5">
                    {!row.hadWinner
                      ? <span className="rounded-full bg-panel2 px-2.5 py-0.5 text-[11px] font-semibold text-mute">No winner</span>
                      : row.motherlodeHit
                        ? <span className="rounded-full bg-yellow-500 px-2.5 py-0.5 text-[11px] font-semibold text-ink">🎰 Motherlode</span>
                        : <span className="rounded-full bg-white px-2.5 py-0.5 text-[11px] font-semibold text-ink">{row.soloMode ? "Solo" : "Split"}</span>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right"><Usdg />{compact(row.totalIn)}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right"><Usdg />{compact(row.winnerPotUsdg)}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right"><Drip />{compact(row.rewardDrip)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Leaderboard — real miners, aggregated from Deployed events over the recent window. */}
      <div className="mt-2">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-mute">Top miners (recent)</h2>
        <div className="divide-y divide-line/60 rounded-2xl border border-line bg-panel">
          {s.miners.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-mute">{s.loading ? "Loading…" : "No miners yet."}</div>
          ) : s.miners.map((r, i) => (
            <div key={r.addr} className="flex items-center justify-between px-4 py-2.5 text-sm">
              <span className="flex items-center gap-3">
                <span className={`w-5 text-center text-xs font-bold ${i === 0 ? "text-yellow-500" : i < 3 ? "text-white" : "text-mute"}`}>{i + 1}</span>
                <span className="h-6 w-6 rounded-full" style={{ background: `hsl(${[...r.addr].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7)} 70% 60%)` }} />
                <span className="text-white">{short(r.addr)}</span>
              </span>
              <span className="flex items-center gap-3 text-mute">
                <span className="text-xs">{r.tiles} tiles</span>
                <span className="font-semibold text-white">{compact(r.total)} USDG</span>
              </span>
            </div>
          ))}
        </div>
      </div>

      <p className="mt-6 text-center text-[11px] text-mute/60">
        On-chain · Robinhood Chain. Recent-window figures come from event logs; all-time analytics (price, $ volume, holders) arrive with the indexer.
      </p>
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
/* eslint-disable @next/next/no-img-element */
function Usdg() {
  return <img src="/usdg.png" alt="USDG" width={12} height={12} className="mr-1 inline-block rounded-full align-[-2px]" />;
}
function Drip() {
  return <img src="/logo.png" alt="DRIP" width={12} height={12} className="mr-1 inline-block rounded-full align-[-2px]" />;
}
