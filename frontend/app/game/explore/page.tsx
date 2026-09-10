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

// Deterministic pseudo-random (seeded by index) so server & client render identically — no hydration
// mismatch. Real activity is indexed from chain (Neon) at launch.
const rand = (n: number) => { const x = Math.sin(n * 127.1) * 43758.5453; return x - Math.floor(x); };
const WINNERS = ["55nF…mqjh", "7xDY…RtXm", "8fB1…C5Kn", "B52R…9Giz", "58X7…UjdM", "5c4R…VHcq", "FiL", "Randomar"];

type Act = {
  r: number; tile: number; winners: number; deployed: number; vaulted: number; winnings: number;
  solo: boolean; winner: string | null; ago: string; mother?: number;
};

const ROUNDS: Act[] = Array.from({ length: 14 }, (_, i) => {
  const deployed = 460 + Math.round(rand(i + 1) * 120);
  const solo = rand(i + 9) < 0.4;
  return {
    r: 399231 - i,
    tile: Math.floor(rand(i + 3) * 25) + 1,
    winners: 118 + Math.floor(rand(i + 5) * 12),
    deployed,
    vaulted: Math.round(deployed * 0.095),
    winnings: Math.round(deployed * 0.9),
    solo,
    winner: solo ? WINNERS[i % WINNERS.length] : null,
    ago: i === 0 ? "55 sec ago" : `${i + 1} min ago`,
  };
});

const MOTHERLODES: Act[] = Array.from({ length: 9 }, (_, i) => {
  const deployed = 480 + Math.round(rand(i + 20) * 380);
  const solo = rand(i + 28) < 0.3;
  const hrs = [4, 5, 9, 9, 24, 48, 48, 48, 72][i];
  return {
    r: 399032 - i * 90 - Math.floor(rand(i + 2) * 80),
    tile: Math.floor(rand(i + 31) * 25) + 1,
    winners: 115 + Math.floor(rand(i + 24) * 30),
    deployed,
    vaulted: Math.round(deployed * 0.095),
    winnings: Math.round(deployed * 0.9),
    mother: Math.round((2 + rand(i + 33) * 380) * 10) / 10,
    solo,
    winner: solo ? WINNERS[(i + 3) % WINNERS.length] : null,
    ago: hrs < 24 ? `${hrs} hours ago` : `${Math.round(hrs / 24)} day${hrs >= 48 ? "s" : ""} ago`,
  };
});

// Revenue tables — ORE-style (Buybacks / Winners / Marketing), each a list of recent transactions.
const AGO = ["21 min ago", "39 min ago", "52 min ago", "1 hour ago", "1 hour ago", "1 hour ago", "2 hours ago", "2 hours ago", "3 hours ago"];
const r2 = (x: number) => Math.round(x * 100) / 100;
const r4 = (x: number) => Math.round(x * 1e4) / 1e4;
type Tok = "usdg" | "drip" | "nvda";
type Rev = { blurb: string; cols: string[]; toks: Tok[]; rows: { ago: string; vals: number[] }[] };
const mkRev = (base: number, spread: number, fn: (s: number) => number[]): { ago: string; vals: number[] }[] =>
  Array.from({ length: 9 }, (_, i) => { const s = r2(base + rand(i + 40) * spread); return { ago: AGO[i], vals: fn(s) }; });

const REVENUE: Record<"buybacks" | "winners" | "marketing", Rev> = {
  buybacks: {
    blurb: "Protocol cut used to buy DRIP off the market — then burned + streamed to stakers.",
    cols: ["Spent", "Burned", "Stakers"], toks: ["usdg", "drip", "drip"],
    rows: mkRev(46, 8, (s) => [s, r2(s * 0.7), r2(s * 0.1)]),
  },
  winners: {
    blurb: "The winners' slice of each cut — 6% as DRIP, 4% as NVDA (tokenized NVIDIA).",
    cols: ["Cut", "DRIP", "NVDA"], toks: ["usdg", "drip", "nvda"],
    rows: mkRev(46, 8, (s) => [s, r2(s * 0.06), r4((s * 0.04) / 176)]),
  },
  marketing: {
    blurb: "The 1% entry fee, skimmed at deploy and withdrawn to the ops wallet.",
    cols: ["Fee", "To ops"], toks: ["usdg", "usdg"],
    rows: mkRev(4.6, 1.4, (s) => [s, s]),
  },
};
const revDec = (t: Tok) => (t === "nvda" ? 4 : 2);

export default function ExplorePage() {
  const [act, setAct] = useState<"rounds" | "motherlodes">("rounds");
  const [rev, setRev] = useState<"buybacks" | "winners" | "marketing">("buybacks");
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
          <Stat label="To winners" value={`${fmt(2054)} DRIP`} sub="6% DRIP + 10% motherlode" />
          <Stat label="NVDA to winners" value="4.86 NVDA" sub="4% of the cut → tokenized NVIDIA" />
        </Grid>
      </Section>

      {/* Activity — ORE-style Rounds / Motherlodes tables */}
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
          {act === "rounds" ? "Recent mining rounds and winners." : "Recent rounds where the motherlode hit."}
        </p>
        <div className="overflow-x-auto rounded-2xl border border-line bg-panel">
          <table className="w-full min-w-[620px] text-left text-sm">
            <thead>
              <tr className="border-b border-line/60 text-[11px] uppercase tracking-wide text-mute">
                <th className="px-3 py-2.5 font-medium">Round</th>
                <th className="px-3 py-2.5 font-medium">Tile</th>
                <th className="px-3 py-2.5 font-medium">Winner</th>
                <th className="px-3 py-2.5 text-right font-medium">Winners</th>
                <th className="px-3 py-2.5 text-right font-medium">Deployed</th>
                <th className="px-3 py-2.5 text-right font-medium">Vaulted</th>
                <th className="px-3 py-2.5 text-right font-medium">Winnings</th>
                {act === "motherlodes" && <th className="px-3 py-2.5 text-right font-medium">Motherlode</th>}
                <th className="px-3 py-2.5 text-right font-medium">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/40">
              {(act === "rounds" ? ROUNDS : MOTHERLODES).map((row) => (
                <tr key={row.r} className="text-white/90">
                  <td className="whitespace-nowrap px-3 py-2.5 font-mono text-mute">#{fmt(row.r)}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-mute">#{row.tile}</td>
                  <td className="whitespace-nowrap px-3 py-2.5"><Winner solo={row.solo} name={row.winner} /></td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right">{row.winners}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right"><Usdg />{fmt(row.deployed)}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right"><Usdg />{fmt(row.vaulted)}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right"><Usdg />{fmt(row.winnings)}</td>
                  {act === "motherlodes" && (
                    <td className="whitespace-nowrap px-3 py-2.5 text-right"><Drip />{fmt(row.mother ?? 0, 1)}</td>
                  )}
                  <td className="whitespace-nowrap px-3 py-2.5 text-right text-mute">{row.ago}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Revenue — ORE-style Buybacks / Winners / Marketing transaction tables */}
      <div className="mb-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-mute">Revenue</h2>
          <div className="inline-flex rounded-full border border-line bg-panel p-0.5">
            {(["buybacks", "winners", "marketing"] as const).map((t) => (
              <button key={t} onClick={() => setRev(t)}
                className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${rev === t ? "bg-white text-ink" : "text-mute"}`}>
                {t}
              </button>
            ))}
          </div>
        </div>
        <p className="mb-3 text-xs text-mute">{REVENUE[rev].blurb}</p>
        <div className="overflow-x-auto rounded-2xl border border-line bg-panel">
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead>
              <tr className="border-b border-line/60 text-[11px] uppercase tracking-wide text-mute">
                <th className="px-3 py-2.5 font-medium">Time</th>
                {REVENUE[rev].cols.map((c) => (
                  <th key={c} className="px-3 py-2.5 text-right font-medium">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line/40">
              {REVENUE[rev].rows.map((row, ri) => (
                <tr key={ri} className="text-white/90">
                  <td className="whitespace-nowrap px-3 py-2.5 text-mute">{row.ago}</td>
                  {row.vals.map((v, ci) => {
                    const tk = REVENUE[rev].toks[ci];
                    return (
                      <td key={ci} className="whitespace-nowrap px-3 py-2.5 text-right">
                        {tk === "usdg" ? <Usdg /> : tk === "drip" ? <Drip /> : null}
                        {fmt(v, revDec(tk))}
                        {tk === "nvda" ? " NVDA" : ""}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

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

function Winner({ solo, name }: { solo: boolean; name: string | null }) {
  return solo && name ? (
    <span className="text-white">{name}</span>
  ) : (
    <span className="rounded-full bg-white px-2.5 py-0.5 text-[11px] font-semibold text-ink">Split</span>
  );
}
/* eslint-disable @next/next/no-img-element */
function Usdg() {
  return <img src="/usdg.png" alt="USDG" width={12} height={12} className="mr-1 inline-block rounded-full align-[-2px]" />;
}
function Drip() {
  return <img src="/logo.png" alt="DRIP" width={12} height={12} className="mr-1 inline-block rounded-full align-[-2px]" />;
}
