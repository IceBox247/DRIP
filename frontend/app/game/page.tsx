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
// A round starts EMPTY and idle — no stake, timer paused — until the first miner deploys. When you
// enter, other miners "join" (seeded here) and the countdown begins.
const empty = (): Tile[] => Array.from({ length: N }, () => ({ mine: 0, others: 0 }));
const seedOthers = (): number[] =>
  Array.from({ length: N }, () => (Math.random() < 0.7 ? Math.round((8 + Math.random() * 60) * 100) / 100 : 0));
const fmt = (n: number, d = 2) => n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

const MINERS = [
  { a: "55nF…mqjh", t: 25, v: 0.63 }, { a: "7ibJ…PU4B", t: 15, v: 0.6 }, { a: "7chh…wC4f", t: 25, v: 0.59 },
  { a: "5c4R…VHcq", t: 15, v: 0.47 }, { a: "8bc6…7rti", t: 25, v: 0.33 }, { a: "NotZohran", t: 15, v: 0.3 },
  { a: "HA36…rpMB", t: 10, v: 0.2 }, { a: "7wfh…VKse", t: 25, v: 0.2 }, { a: "H8VM…66bA", t: 15, v: 0.15 },
];

export default function MinePage() {
  const [mode, setMode] = useState<"lite" | "pro">("pro");
  const [tiles, setTiles] = useState<Tile[]>(empty);
  const [started, setStarted] = useState(false); // timer runs only after the first miner enters
  const [selected, setSelected] = useState<number[]>([]);
  const [amount, setAmount] = useState(10);
  const [usdg, setUsdg] = useState(START_USDG);
  const [unrefined, setUnrefined] = useState(0);
  const [claimed, setClaimed] = useState(0);
  const [nvda, setNvda] = useState(0); // tokenized NVIDIA won (4% refining slice, 1-or-all)
  const [motherlode, setMotherlode] = useState(26);
  const [adminFees, setAdminFees] = useState(0);
  const [timeLeft, setTimeLeft] = useState<number>(gridMine.roundSeconds);
  const [round, setRound] = useState(397203);
  const [last, setLast] = useState<{ tile: number; solo: boolean; winner: string } | null>({ tile: 13, solo: false, winner: "KingAmadán" });
  const [result, setResult] = useState<null | { tile: number; won: boolean; usdgDelta: number; drip: number; nvda: number; solo: boolean; soloYou: boolean; motherlodeHit: boolean }>(null);
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
    // First deploy of the round: other miners join and the timer starts.
    const others = started ? null : seedOthers();
    setTiles((ts) => ts.map((t, j) => ({
      ...t,
      others: others ? t.others + others[j] : t.others,
      mine: targets.includes(j) ? t.mine + per : t.mine,
    })));
    if (!started) setStarted(true);
    setSelected([]);
  }, [amount, targets, canDeploy, started]);

  const settle = useCallback(() => {
    const gross = tiles.reduce((s, t) => s + t.mine + t.others, 0);
    const tile = Math.floor(Math.random() * N);
    const winnerStake = tiles[tile].mine + tiles[tile].others;
    const mine = tiles[tile].mine;
    const loserStake = gross - winnerStake;
    let usdgDelta = 0, drip = 0, nvda = 0, solo = false, soloYou = false, motherlodeHit = false;
    if (winnerStake > 0) {
      const cut = (loserStake * gridMine.loserCutBps) / 10000;
      const winnerPot = loserStake - cut;
      if (mine > 0) usdgDelta = mine + (winnerPot * mine) / winnerStake;
      const winnersDrip = (cut * gridMine.cutSplitWinnersBps) / 10000;
      const motherAdd = (cut * gridMine.cutSplitMotherlodeBps) / 10000;
      // Winners' 4% slice buys NVDA; converted to shares at the demo price.
      const nvdaPool = ((cut * gridMine.cutSplitWinnersNvdaBps) / 10000) / gridMine.nvdaPrice;
      let payoutPool = winnersDrip;
      const next = motherlode + motherAdd;
      if (Math.random() * gridMine.motherlodeOdds < 1) { motherlodeHit = true; payoutPool += next; setMotherlode(0); }
      else setMotherlode(Math.round(next * 100) / 100);
      solo = Math.random() < 1 / gridMine.soloOdds;
      if (mine > 0) {
        if (solo) {
          soloYou = Math.random() < mine / winnerStake; // NVDA follows the same 1-or-all as DRIP
          drip = soloYou ? payoutPool : 0;
          nvda = soloYou ? nvdaPool : 0;
        } else {
          drip = (payoutPool * mine) / winnerStake;
          nvda = (nvdaPool * mine) / winnerStake;
        }
      }
    }
    if (usdgDelta > 0) setUsdg((u) => Math.round((u + usdgDelta) * 100) / 100);
    if (drip > 0) setUnrefined((d) => Math.round((d + drip) * 1e6) / 1e6);
    if (nvda > 0) setNvda((n) => Math.round((n + nvda) * 1e6) / 1e6);
    setResult({ tile, won: usdgDelta > 0, usdgDelta, drip, nvda, solo, soloYou, motherlodeHit });
    setLast({ tile, solo, winner: soloYou ? "You" : MINERS[Math.floor(Math.random() * MINERS.length)].a });
  }, [tiles, motherlode]);

  const nextRound = useCallback(() => {
    setRound((r) => r + 1);
    setTiles(empty());
    setResult(null);
    setSelected([]);
    setStarted(false);
    setTimeLeft(gridMine.roundSeconds);
  }, []);

  const claim = () => {
    if (unrefined <= 0) return;
    setClaimed((c) => Math.round((c + unrefined * (1 - gridMine.refineFeeBps / 10000)) * 1e6) / 1e6);
    setUnrefined(0);
  };

  // Countdown — only runs once a miner has entered (started). No entries = timer stays paused.
  useEffect(() => {
    if (result || !started) return;
    if (timeLeft <= 0) { settle(); return; }
    const id = setTimeout(() => setTimeLeft((t) => t - 1), 1000);
    return () => clearTimeout(id);
  }, [timeLeft, result, started, settle]);

  // Auto-advance to the next round a few seconds after settlement.
  useEffect(() => {
    if (!result) return;
    const id = setTimeout(nextRound, 4500);
    return () => clearTimeout(id);
  }, [result, nextRound]);

  const mm = String(Math.floor(timeLeft / 60)).padStart(2, "0");
  const ss = String(timeLeft % 60).padStart(2, "0");

  return (
    <AppChrome>
      {/* Stat header */}
      <div className="grid grid-cols-3 px-4 py-6 text-center">
        <Stat label="DEPLOYED" value={fmt(pool)} accent />
        <Stat label="MOTHERLODE" value={fmt(motherlode, 0)} gold border />
        <Stat label="TIME" value={result ? "00:00" : !started ? "--:--" : `${mm}:${ss}`} danger={started && !result && timeLeft <= 10} />
      </div>

      {/* Waiting state — the round is idle until the first miner deploys. */}
      {!started && !result && (
        <div className="mx-4 mb-1 flex items-center justify-center gap-2 rounded-xl border border-line bg-panel/60 px-4 py-2 text-xs text-mute">
          <span className="h-1.5 w-1.5 rounded-full bg-lime animate-pulseDot" />
          Waiting for the first miner — the timer starts when someone deploys.
        </div>
      )}

      {result && (
        <div className={`mx-4 mt-4 rounded-2xl border p-4 text-sm ${result.won ? "border-lime/40 bg-lime/10 text-white" : "border-line bg-panel text-mute"}`}>
          <div className="font-semibold text-white">Round #{round} — tile {result.tile} won{result.motherlodeHit ? " · 🎰 MOTHERLODE" : ""}</div>
          <div className="mt-1">
            {result.won ? (
              <>
                {`+${fmt(result.usdgDelta)} USDG`}
                {result.solo
                  ? result.soloYou
                    ? ` · SOLO — all ${fmt(result.drip, 3)} DRIP + ${fmt(result.nvda, 4)} NVDA 🏆`
                    : " · solo round (DRIP + NVDA went to one winner)"
                  : ` · +${fmt(result.drip, 3)} DRIP · +${fmt(result.nvda, 4)} NVDA`}
              </>
            ) : (
              "You had no stake on the winning tile."
            )}
          </div>
          <button onClick={nextRound} className="mt-3 w-full rounded-xl bg-lime py-2.5 text-sm font-semibold text-ink">Next round now</button>
          <div className="mt-1.5 text-center text-[11px] text-mute">Next round starts automatically…</div>
        </div>
      )}

      {/* Last round + grid + Lite/Pro toggle (below the grid, ORE-style) */}
      {!result && (
        <>
          <div className="mx-4 mt-4 flex items-center justify-between rounded-xl border border-line bg-panel/60 px-4 py-2 text-xs">
            <span className="uppercase tracking-wide text-mute">Last round</span>
            <span className="flex items-center gap-2 text-mute">
              <span className="flex items-center gap-1"><Grid4 /> {last?.tile}</span>
              <span className="font-medium text-white/90">{last?.winner}</span>
              <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-ink">{last?.solo ? "Solo" : "Split"}</span>
              <span className="text-mute/70">›</span>
            </span>
          </div>

          {mode === "pro" && (
            <div className="grid grid-cols-5 gap-1.5 px-4 pt-3">
              {tiles.map((t, i) => {
                const sel = selected.includes(i);
                const total = t.mine + t.others;
                return (
                  <button key={i} onClick={() => toggle(i)}
                    className={`relative aspect-square rounded-xl border transition-all ${sel ? "border-white ring-1 ring-white/60" : "border-line bg-panel/40 hover:border-mute/50"} ${t.mine > 0 ? "bg-lime/5" : ""}`}>
                    {sparkles[i] && <span className="absolute right-1 top-1 text-[8px] text-white/50">✦</span>}
                    <div className="absolute bottom-1 left-1 flex items-center gap-0.5 text-[10px] font-medium text-mute">
                      <Usdg /> {fmt(total, total >= 1 ? 1 : 3)}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Lite / Pro toggle + settings — sits below the grid, like ORE */}
          <div className="relative mt-5 flex items-center justify-center px-4">
            <div className="inline-flex rounded-full border border-line bg-panel p-1">
              {(["lite", "pro"] as const).map((m) => (
                <button key={m} onClick={() => setMode(m)}
                  className={`rounded-full px-6 py-1.5 text-sm font-semibold capitalize ${mode === m ? "bg-white text-ink" : "text-mute"}`}>
                  {m}
                </button>
              ))}
            </div>
            <button aria-label="Settings" className="absolute right-4 text-mute transition-colors hover:text-white">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>
          </div>
        </>
      )}

      {/* Deploy panel */}
      {!result && (
        <div className="px-4 pt-6">
          <div className="text-center">
            <div className="text-5xl font-semibold tracking-tight text-white">{fmt(amount, 0)}</div>
            <div className="mt-1 flex justify-center"><Usdg big /></div>
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
              <span className="flex items-center gap-1 font-semibold text-white"><Usdg /> {fmt(amount, 0)}</span>
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
        <div className="mt-3 flex items-center justify-between border-t border-line/50 pt-3">
          <div>
            <div className="text-xs uppercase tracking-wide text-mute">NVDA won</div>
            <div className="mt-0.5 text-xl font-semibold text-white">{fmt(nvda, 4)}</div>
          </div>
          <span className="rounded-full border border-line bg-panel2 px-3 py-1 text-[11px] text-mute">4% of the cut · tokenized NVIDIA</span>
        </div>
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
                <span className="flex items-center gap-1 text-xs"><Grid4 /> {m.t}</span>
                <span className="flex items-center gap-1 font-semibold text-white"><Usdg /> {fmt(m.v, 2)}</span>
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
        {accent && <Usdg />}
        {gold && <Drip />}
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

// DRIP glyph — the official Drip mark (public/logo.png). Used for DRIP amounts (e.g. the motherlode).
function Drip({ big }: { big?: boolean }) {
  const s = big ? 24 : 18;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/logo.png" alt="DRIP" width={s} height={s} className="inline-block shrink-0 rounded-full" />;
}

// Small 2×2 grid glyph — the tile-count marker (ORE-style) in the Last round / Miners rows.
function Grid4() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="currentColor" className="inline-block" aria-hidden="true">
      <rect x="0" y="0" width="5" height="5" rx="1" /><rect x="7" y="0" width="5" height="5" rx="1" />
      <rect x="0" y="7" width="5" height="5" rx="1" /><rect x="7" y="7" width="5" height="5" rx="1" />
    </svg>
  );
}

// USDG glyph — the real Global Dollar mark (public/usdg.png). Used for every USDG amount.
function Usdg({ big }: { big?: boolean }) {
  const s = big ? 22 : 13;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/usdg.png" alt="USDG" width={s} height={s} className="inline-block shrink-0 rounded-full" />;
}
