"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppChrome } from "@/components/AppChrome";
import { gridMine } from "@/lib/site";

// Grid Mine — ORE-style Mine screen. Interactive DEMO (fake funds, no chain). Round math mirrors
// contracts/src/game/GridMine.sol: 1% entry fee at deploy, 90% of the loser pot to winners (USDG),
// 10% cut buys DRIP (70/10/10/10), 1-or-all winner, 1/625 motherlode, 10% refine tax.

type Tile = { mine: number; others: number };
const N = gridMine.tiles;
const START_USDG = 1000;
const seed = () =>
  Array.from({ length: N }, () => ({ mine: 0, others: Math.random() < 0.7 ? Math.round((8 + Math.random() * 60) * 100) / 100 : 0 }));
const fmt = (n: number, d = 2) => n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

const MINERS = [
  { a: "55nF…mqjh", t: 25, v: 0.63 }, { a: "7ibJ…PU4B", t: 15, v: 0.6 }, { a: "7chh…wC4f", t: 25, v: 0.59 },
  { a: "5c4R…VHcq", t: 15, v: 0.47 }, { a: "8bc6…7rti", t: 25, v: 0.33 }, { a: "NotZohran", t: 15, v: 0.3 },
  { a: "HA36…rpMB", t: 10, v: 0.2 }, { a: "7wfh…VKse", t: 25, v: 0.2 }, { a: "H8VM…66bA", t: 15, v: 0.15 },
];

export default function MinePage() {
  const [mode, setMode] = useState<"lite" | "pro">("pro");
  const [tiles, setTiles] = useState<Tile[]>(seed);
  const [selected, setSelected] = useState<number[]>([]);
  const [amount, setAmount] = useState(10);
  const [usdg, setUsdg] = useState(START_USDG);
  const [unrefined, setUnrefined] = useState(0);
  const [claimed, setClaimed] = useState(0);
  const [motherlode, setMotherlode] = useState(26);
  const [adminFees, setAdminFees] = useState(0);
  const [timeLeft, setTimeLeft] = useState<number>(gridMine.roundSeconds);
  const [round, setRound] = useState(397203);
  const [last, setLast] = useState<{ tile: number; solo: boolean } | null>({ tile: 13, solo: false });
  const [result, setResult] = useState<null | { tile: number; won: boolean; usdgDelta: number; drip: number; solo: boolean; soloYou: boolean; motherlodeHit: boolean }>(null);
  const [sparkles] = useState<boolean[]>(() => Array.from({ length: N }, () => Math.random() < 0.4));

  const pool = useMemo(() => tiles.reduce((s, t) => s + t.mine + t.others, 0), [tiles]);
  const targets = mode === "lite" ? Array.from({ length: N }, (_, i) => i) : selected;
  const canDeploy = !result && amount > 0 && amount <= usdg && targets.length > 0;

  const toggle = (i: number) => {
    if (result) return;
    setSelected((s) => (s.includes(i) ? s.filter((x) => x !== i) : [...s, i]));
  };

  const deployNow = useCallback(() => {
    if (!canDeploy) return;
    const admin = (amount * gridMine.adminFeeBps) / 10000;
    const per = Math.round(((amount - admin) / targets.length) * 1e4) / 1e4;
    setUsdg((u) => Math.round((u - amount) * 100) / 100);
    setAdminFees((a) => Math.round((a + admin) * 100) / 100);
    setTiles((ts) => ts.map((t, j) => (targets.includes(j) ? { ...t, mine: t.mine + per } : t)));
    setSelected([]);
  }, [amount, targets, canDeploy]);

  const settle = useCallback(() => {
    const gross = tiles.reduce((s, t) => s + t.mine + t.others, 0);
    const tile = Math.floor(Math.random() * N);
    const winnerStake = tiles[tile].mine + tiles[tile].others;
    const mine = tiles[tile].mine;
    const loserStake = gross - winnerStake;
    let usdgDelta = 0, drip = 0, solo = false, soloYou = false, motherlodeHit = false;
    if (winnerStake > 0) {
      const cut = (loserStake * gridMine.loserCutBps) / 10000;
      const winnerPot = loserStake - cut;
      if (mine > 0) usdgDelta = mine + (winnerPot * mine) / winnerStake;
      const winnersDrip = (cut * gridMine.cutSplitWinnersBps) / 10000;
      const motherAdd = (cut * gridMine.cutSplitMotherlodeBps) / 10000;
      let payoutPool = winnersDrip;
      const next = motherlode + motherAdd;
      if (Math.random() * gridMine.motherlodeOdds < 1) { motherlodeHit = true; payoutPool += next; setMotherlode(0); }
      else setMotherlode(Math.round(next * 100) / 100);
      solo = Math.random() < 1 / gridMine.soloOdds;
      if (mine > 0) {
        if (solo) { soloYou = Math.random() < mine / winnerStake; drip = soloYou ? payoutPool : 0; }
        else drip = (payoutPool * mine) / winnerStake;
      }
    }
    if (usdgDelta > 0) setUsdg((u) => Math.round((u + usdgDelta) * 100) / 100);
    if (drip > 0) setUnrefined((d) => Math.round((d + drip) * 1e6) / 1e6);
    setResult({ tile, won: usdgDelta > 0, usdgDelta, drip, solo, soloYou, motherlodeHit });
    setLast({ tile, solo });
  }, [tiles, motherlode]);

  const nextRound = useCallback(() => {
    setRound((r) => r + 1);
    setTiles(seed());
    setResult(null);
    setSelected([]);
    setTimeLeft(gridMine.roundSeconds);
  }, []);

  const claim = () => {
    if (unrefined <= 0) return;
    setClaimed((c) => Math.round((c + unrefined * (1 - gridMine.refineFeeBps / 10000)) * 1e6) / 1e6);
    setUnrefined(0);
  };

  useEffect(() => {
    if (result) return;
    if (timeLeft <= 0) { settle(); return; }
    const id = setTimeout(() => setTimeLeft((t) => t - 1), 1000);
    return () => clearTimeout(id);
  }, [timeLeft, result, settle]);

  const mm = String(Math.floor(timeLeft / 60)).padStart(2, "0");
  const ss = String(timeLeft % 60).padStart(2, "0");

  return (
    <AppChrome>
      {/* Stat header */}
      <div className="grid grid-cols-3 px-4 py-6 text-center">
        <Stat label="DEPLOYED" value={fmt(pool)} accent />
        <Stat label="MOTHERLODE" value={fmt(motherlode, 0)} gold border />
        <Stat label="TIME" value={result ? "00:00" : `${mm}:${ss}`} danger={!result && timeLeft <= 10} />
      </div>

      {/* Lite / Pro toggle */}
      <div className="flex items-center justify-center gap-1 rounded-full">
        <div className="inline-flex rounded-full border border-line bg-panel p-1">
          {(["lite", "pro"] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)}
              className={`rounded-full px-5 py-1.5 text-sm font-semibold capitalize ${mode === m ? "bg-white text-ink" : "text-mute"}`}>
              {m}
            </button>
          ))}
        </div>
      </div>

      {result && (
        <div className={`mx-4 mt-4 rounded-2xl border p-4 text-sm ${result.won ? "border-lime/40 bg-lime/10 text-white" : "border-line bg-panel text-mute"}`}>
          <div className="font-semibold text-white">Round #{round} — tile {result.tile} won{result.motherlodeHit ? " · 🎰 MOTHERLODE" : ""}</div>
          <div className="mt-1">
            {result.won
              ? `+${fmt(result.usdgDelta)} USDG` + (result.solo ? (result.soloYou ? ` · SOLO — all ${fmt(result.drip, 3)} DRIP 🏆` : " · solo round (DRIP went to one winner)") : ` · +${fmt(result.drip, 3)} DRIP`)
              : "You had no stake on the winning tile."}
          </div>
          <button onClick={nextRound} className="mt-3 w-full rounded-xl bg-lime py-2.5 text-sm font-semibold text-ink">Next round</button>
        </div>
      )}

      {/* Pro grid */}
      {mode === "pro" && !result && (
        <>
          <div className="mx-4 mt-4 flex items-center justify-between rounded-xl border border-line bg-panel/60 px-4 py-2 text-xs">
            <span className="uppercase tracking-wide text-mute">Last round</span>
            <span className="flex items-center gap-2 text-mute">
              tile #{last?.tile}
              <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-ink">{last?.solo ? "Solo" : "Split"}</span>
            </span>
          </div>
          <div className="grid grid-cols-5 gap-1.5 px-4 pt-3">
            {tiles.map((t, i) => {
              const sel = selected.includes(i);
              const total = t.mine + t.others;
              return (
                <button key={i} onClick={() => toggle(i)}
                  className={`relative aspect-square rounded-xl border transition-all ${sel ? "border-white ring-1 ring-white/60" : "border-line bg-panel/40 hover:border-mute/50"} ${t.mine > 0 ? "bg-lime/5" : ""}`}>
                  {sparkles[i] && <span className="absolute right-1 top-1 text-[8px] text-white/50">✦</span>}
                  <div className="absolute bottom-1 left-1 flex items-center gap-0.5 text-[10px] font-medium text-mute">
                    <Bars /> {fmt(total, total >= 1 ? 1 : 3)}
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* Deploy panel */}
      {!result && (
        <div className="px-4 pt-6">
          <div className="text-center">
            <div className="text-5xl font-semibold tracking-tight text-white">{fmt(amount, 0)}</div>
            <div className="mt-1 flex justify-center"><Bars big /></div>
          </div>
          <div className="mt-5 grid grid-cols-4 gap-2">
            {[
              { l: "+1", f: () => setAmount((a) => a + 1) },
              { l: "+10", f: () => setAmount((a) => a + 10) },
              { l: "+100", f: () => setAmount((a) => a + 100) },
              { l: "MAX", f: () => setAmount(Math.floor(usdg)) },
            ].map((b) => (
              <button key={b.l} onClick={b.f} className="rounded-full bg-panel py-3 text-sm font-semibold text-white hover:bg-panel2">{b.l}</button>
            ))}
          </div>

          <div className="mt-5 space-y-3 text-sm">
            {mode === "pro" && (
              <Row label="TILES">
                <div className="flex items-center gap-2">
                  <button onClick={() => setSelected(selected.length === N ? [] : Array.from({ length: N }, (_, i) => i))}
                    className="rounded-lg bg-panel px-3 py-1 text-xs font-semibold text-white">ALL</button>
                  <span className="w-6 text-right font-semibold text-white">{selected.length}</span>
                </div>
              </Row>
            )}
            <Row label="ROUNDS"><span className="font-semibold text-mute">1</span></Row>
            <Row label="PER ROUND">
              <span className="flex items-center gap-1 font-semibold text-white"><Bars /> {fmt(amount, 0)}</span>
            </Row>
          </div>

          <button disabled={!canDeploy} onClick={deployNow}
            className="mt-5 w-full rounded-2xl bg-lime py-4 text-base font-semibold text-ink transition-transform enabled:hover:scale-[1.01] disabled:cursor-not-allowed disabled:bg-panel disabled:text-mute">
            {mode === "pro" && selected.length === 0 ? "Select tiles to deploy" : `Deploy ${fmt(amount, 0)} USDG`}
          </button>
          <div className="mt-2 flex justify-between text-xs text-mute">
            <span>Wallet {fmt(usdg)} USDG</span>
            <span>1% entry fee → {fmt(adminFees)} USDG</span>
          </div>
        </div>
      )}

      {/* Winnings */}
      <div className="mx-4 mt-6 rounded-2xl border border-line bg-panel p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-wide text-mute">Unrefined DRIP</div>
            <div className="mt-0.5 text-xl font-semibold text-white">{fmt(unrefined, 4)}</div>
          </div>
          <button onClick={claim} disabled={unrefined <= 0}
            className="rounded-lg bg-lime px-4 py-2 text-sm font-semibold text-ink disabled:cursor-not-allowed disabled:bg-lime/30 disabled:text-ink/60">
            Claim (−10%)
          </button>
        </div>
        <div className="mt-1 text-xs text-mute">In wallet: {fmt(claimed, 4)} DRIP · claiming taxes 10% to unclaimed holders</div>
      </div>

      {/* Miners */}
      <div className="mx-4 mt-4">
        <div className="mb-2 text-xs uppercase tracking-wide text-mute">Miners</div>
        <div className="divide-y divide-line/60 rounded-2xl border border-line bg-panel">
          {MINERS.map((m) => (
            <div key={m.a} className="flex items-center justify-between px-4 py-2.5 text-sm">
              <span className="flex items-center gap-2">
                <span className="h-6 w-6 rounded-full bg-panel2" />
                <span className="text-white">{m.a}</span>
              </span>
              <span className="flex items-center gap-3 text-mute">
                <span className="text-xs">▦ {m.t}</span>
                <span className="flex items-center gap-1 font-semibold text-white"><Bars /> {fmt(m.v, 2)}</span>
              </span>
            </div>
          ))}
        </div>
      </div>

      <p className="px-4 py-6 text-center text-[11px] text-mute/60">
        Demo · fake funds, no chain. A game of chance; not available where prohibited.
      </p>
    </AppChrome>
  );
}

function Stat({ label, value, accent, gold, danger, border }: { label: string; value: string; accent?: boolean; gold?: boolean; danger?: boolean; border?: boolean }) {
  return (
    <div className={border ? "border-x border-line/60" : ""}>
      <div className={`flex items-center justify-center gap-1.5 text-2xl font-semibold ${danger ? "text-red-400" : gold ? "text-yellow-500" : "text-white"}`}>
        {accent && <Bars />}
        {gold && <span className="text-yellow-500">◎</span>}
        {value}
      </div>
      <div className="mt-1 text-[11px] uppercase tracking-wide text-mute">{label}</div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-line/40 pb-3">
      <span className="text-xs uppercase tracking-wide text-mute">{label}</span>
      {children}
    </div>
  );
}

// Small DRIP/USDG glyph (stacked bars, lime).
function Bars({ big }: { big?: boolean }) {
  const s = big ? 22 : 12;
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" className="inline-block">
      <path d="M4 6h13l3 3H7L4 6z" fill="#c6f24e" /><path d="M4 12h13l3 3H7l-3-3z" fill="#8b7cf6" opacity="0.9" /><path d="M4 18h13l3-3H7l-3 3z" fill="#22d3ee" opacity="0.7" />
    </svg>
  );
}
