"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { AppChrome } from "@/components/AppChrome";
import { Faucet } from "@/components/Faucet";
import { contractsReady } from "@/lib/contracts";
import { gridMine } from "@/lib/site";

// Grid Mine — ORE-style Mine screen. Interactive DEMO (fake funds, no chain). Round math mirrors
// contracts/src/game/GridMine.sol: 1% entry fee at deploy, 90% of the loser pot to winners (USDG),
// 10% cut buys DRIP (70/10/10/10), 1-or-all winner, 1/625 motherlode, 10% refine tax.

type Tile = { mine: number; others: number };
const N = gridMine.tiles;
const START_USDG = 1000;
// A round is always live (ORE-style): the grid is populated with other miners and the timer runs.
// `empty` is the SSR-safe first paint (deterministic); `seeded` fills the grid on the client.
const empty = (): Tile[] => Array.from({ length: N }, () => ({ mine: 0, others: 0 }));
const seedOthers = (): number[] =>
  Array.from({ length: N }, () => (Math.random() < 0.7 ? Math.round((8 + Math.random() * 60) * 100) / 100 : 0));
const seeded = (): Tile[] => { const o = seedOthers(); return Array.from({ length: N }, (_, i) => ({ mine: 0, others: o[i] })); };
const fmt = (n: number, d = 2) => n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

const MINERS = [
  { a: "55nF…mqjh", t: 25, v: 0.63 }, { a: "7ibJ…PU4B", t: 15, v: 0.6 }, { a: "7chh…wC4f", t: 25, v: 0.59 },
  { a: "5c4R…VHcq", t: 15, v: 0.47 }, { a: "8bc6…7rti", t: 25, v: 0.33 }, { a: "NotZohran", t: 15, v: 0.3 },
  { a: "HA36…rpMB", t: 10, v: 0.2 }, { a: "7wfh…VKse", t: 25, v: 0.2 }, { a: "H8VM…66bA", t: 15, v: 0.15 },
];

export default function MinePage() {
  const { isConnected } = useAccount();
  const live = isConnected && contractsReady; // wallet connected + testnet contracts configured
  const [mode, setMode] = useState<"lite" | "pro">("pro");
  const [tiles, setTiles] = useState<Tile[]>(empty);
  const [selected, setSelected] = useState<number[]>([]);
  const [amount, setAmount] = useState(10);
  const [usdg, setUsdg] = useState(START_USDG);
  const [unrefined, setUnrefined] = useState(0); // DRIP won this round(s), not yet claimed
  const [claimed, setClaimed] = useState(0); // refined DRIP, in wallet
  const [motherlode, setMotherlode] = useState(26);
  const [timeLeft, setTimeLeft] = useState<number>(gridMine.roundSeconds);
  const [round, setRound] = useState(397203);
  const [last, setLast] = useState<{ tile: number; solo: boolean; winner: string } | null>({ tile: 13, solo: false, winner: "KingAmadán" });
  const [result, setResult] = useState<null | { tile: number; won: boolean; usdgDelta: number; drip: number; solo: boolean; soloYou: boolean; motherlodeHit: boolean }>(null);
  const [revealing, setRevealing] = useState(false); // "finding the winner" animation phase
  const [revealTile, setRevealTile] = useState<number | null>(null);
  const [sparkles] = useState<boolean[]>(() => Array.from({ length: N }, () => Math.random() < 0.4));

  const pool = useMemo(() => tiles.reduce((s, t) => s + t.mine + t.others, 0), [tiles]);
  const targets = mode === "lite" ? Array.from({ length: N }, (_, i) => i) : selected;
  const busy = !!result || revealing;
  const canDeploy = !busy && amount > 0 && amount <= usdg && targets.length > 0;

  const toggle = (i: number) => {
    if (busy) return;
    setSelected((s) => (s.includes(i) ? s.filter((x) => x !== i) : [...s, i]));
  };

  const deployNow = useCallback(() => {
    if (!canDeploy) return;
    const admin = (amount * gridMine.adminFeeBps) / 10000;
    const per = Math.round(((amount - admin) / targets.length) * 1e4) / 1e4;
    setUsdg((u) => Math.round((u - amount) * 100) / 100);
    setTiles((ts) => ts.map((t, j) => (targets.includes(j) ? { ...t, mine: t.mine + per } : t)));
    setSelected([]);
  }, [amount, targets, canDeploy]);

  // Pure: compute the round outcome (winning tile + payouts) without touching state.
  const computeOutcome = useCallback(() => {
    const gross = tiles.reduce((s, t) => s + t.mine + t.others, 0);
    const tile = Math.floor(Math.random() * N);
    const winnerStake = tiles[tile].mine + tiles[tile].others;
    const mine = tiles[tile].mine;
    const loserStake = gross - winnerStake;
    let usdgDelta = 0, drip = 0, solo = false, soloYou = false, motherlodeHit = false, newMotherlode = motherlode;
    if (winnerStake > 0) {
      const cut = (loserStake * gridMine.loserCutBps) / 10000;
      const winnerPot = loserStake - cut;
      if (mine > 0) usdgDelta = mine + (winnerPot * mine) / winnerStake;
      const winnersDrip = (cut * gridMine.cutSplitWinnersBps) / 10000;
      const motherAdd = (cut * gridMine.cutSplitMotherlodeBps) / 10000;
      let payoutPool = winnersDrip;
      const next = motherlode + motherAdd;
      if (Math.random() * gridMine.motherlodeOdds < 1) { motherlodeHit = true; payoutPool += next; newMotherlode = 0; }
      else newMotherlode = Math.round(next * 100) / 100;
      solo = Math.random() < 1 / gridMine.soloOdds;
      if (mine > 0) {
        if (solo) { soloYou = Math.random() < mine / winnerStake; drip = soloYou ? payoutPool : 0; }
        else drip = (payoutPool * mine) / winnerStake;
      }
    }
    return { tile, usdgDelta, drip, solo, soloYou, motherlodeHit, newMotherlode };
  }, [tiles, motherlode]);

  const applyOutcome = useCallback((o: ReturnType<typeof computeOutcome>) => {
    setMotherlode(o.newMotherlode);
    if (o.usdgDelta > 0) setUsdg((u) => Math.round((u + o.usdgDelta) * 100) / 100);
    if (o.drip > 0) setUnrefined((d) => Math.round((d + o.drip) * 1e6) / 1e6);
    setResult({ tile: o.tile, won: o.usdgDelta > 0, usdgDelta: o.usdgDelta, drip: o.drip, solo: o.solo, soloYou: o.soloYou, motherlodeHit: o.motherlodeHit });
    setLast({ tile: o.tile, solo: o.solo, winner: o.soloYou ? "You" : MINERS[Math.floor(Math.random() * MINERS.length)].a });
  }, []);

  // "Finding the winner" reveal: flash across tiles, land on the winner, hold, then show the result.
  const startReveal = useCallback(() => {
    setRevealing(true);
    const o = computeOutcome();
    let ticks = 0;
    const iv = setInterval(() => {
      ticks++;
      setRevealTile(Math.floor(Math.random() * N));
      if (ticks >= 20) {
        clearInterval(iv);
        setRevealTile(o.tile); // land on the actual winner
        setTimeout(() => { applyOutcome(o); setRevealing(false); setRevealTile(null); }, 800);
      }
    }, 110);
  }, [computeOutcome, applyOutcome]);

  const nextRound = useCallback(() => {
    setRound((r) => r + 1);
    setTiles(seeded());
    setResult(null);
    setSelected([]);
    setTimeLeft(gridMine.roundSeconds);
  }, []);

  const claim = () => {
    if (unrefined <= 0) return;
    setClaimed((c) => Math.round((c + unrefined * (1 - gridMine.refineFeeBps / 10000)) * 1e6) / 1e6);
    setUnrefined(0);
  };

  // Populate the grid on the client (avoids an SSR/client hydration mismatch from Math.random).
  useEffect(() => { setTiles(seeded()); }, []);

  // Countdown — always running (ORE-style). At zero, run the reveal animation.
  useEffect(() => {
    if (busy) return;
    if (timeLeft <= 0) { startReveal(); return; }
    const id = setTimeout(() => setTimeLeft((t) => t - 1), 1000);
    return () => clearTimeout(id);
  }, [timeLeft, busy, startReveal]);

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
        <Stat label="TIME" value={result ? "00:00" : revealing ? "···" : `${mm}:${ss}`} danger={!busy && timeLeft <= 10} />
      </div>

      {/* Live testnet balance + faucet (only when a wallet is connected and contracts are configured) */}
      <Faucet />

      {/* Reveal — "finding the winner" suspense after the countdown. */}
      {revealing && (
        <div className="mx-4 mt-4 flex items-center justify-center gap-2 rounded-2xl border border-lime/40 bg-lime/10 px-4 py-3 text-sm font-semibold text-white">
          <span className="h-2 w-2 animate-ping rounded-full bg-lime" />
          Finding the winning tile…
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
                    ? ` · SOLO — all ${fmt(result.drip, 3)} DRIP 🏆`
                    : " · solo round (DRIP went to one winner)"
                  : ` · +${fmt(result.drip, 3)} DRIP`}
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
                const lit = revealing && revealTile === i; // the flashing highlight during the reveal
                return (
                  <button key={i} onClick={() => toggle(i)}
                    className={`relative aspect-square rounded-xl border transition-all duration-100 ${
                      lit ? "scale-105 border-lime bg-lime/25 ring-2 ring-lime"
                        : sel ? "border-white ring-1 ring-white/60"
                        : "border-line bg-panel/40 hover:border-mute/50"
                    } ${t.mine > 0 && !lit ? "bg-lime/5" : ""} ${revealing && !lit ? "opacity-50" : ""}`}>
                    {sparkles[i] && <span className="absolute right-1 top-1 text-[8px] text-white/50">✦</span>}
                    <div className="absolute bottom-1 left-1 flex items-center gap-0.5 text-[10px] font-medium text-mute">
                      <Usdg /> {fmt(total, total >= 1 ? 1 : 3)}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Lite / Pro toggle + settings — sits below the grid, like ORE. Hidden during the reveal. */}
          {!revealing && (
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
          )}
        </>
      )}

      {/* Deploy panel */}
      {!busy && (
        <div className="px-4 pt-6">
          <div className="text-center">
            {/* Editable — tap to type any amount, or use the quick buttons below. */}
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              value={amount || ""}
              onChange={(e) => setAmount(Math.max(0, Number(e.target.value)))}
              placeholder="0"
              aria-label="Deploy amount in USDG"
              className="w-full bg-transparent text-center text-5xl font-semibold tracking-tight text-white placeholder:text-mute/40 focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
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
              <span className="flex items-center gap-1 font-semibold text-white"><Usdg /> {fmt(amount, amount % 1 ? 2 : 0)}</span>
            </Row>
          </div>

          <button disabled={!canDeploy} onClick={deployNow}
            className="mt-5 w-full rounded-2xl bg-lime py-4 text-base font-semibold text-ink transition-transform enabled:hover:scale-[1.01] disabled:cursor-not-allowed disabled:bg-panel disabled:text-mute">
            {mode === "pro" && selected.length === 0 ? "Select tiles to deploy" : `Deploy ${fmt(amount, amount % 1 ? 2 : 0)} USDG`}
          </button>
          <div className="mt-2 flex justify-between text-xs text-mute">
            <span>{live ? "Practice round" : `Wallet ${fmt(usdg)} USDG`}</span>
            <span>1% entry fee → {fmt(amount * gridMine.adminFeeBps / 10000, 2)} USDG</span>
          </div>
          {live && (
            <p className="mt-1 text-center text-[11px] text-mute/70">
              This is still a practice round — it doesn&rsquo;t spend your real USDG yet. On-chain deploy is coming.
            </p>
          )}
        </div>
      )}

      {/* Winnings */}
      <div className="mx-4 mt-6 rounded-2xl border border-line bg-panel p-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-line bg-ink/40 p-3">
            <div className="text-[11px] uppercase tracking-wide text-mute">Unrefined DRIP</div>
            <div className="mt-0.5 flex items-center gap-1 text-xl font-semibold text-white"><Drip /> {fmt(unrefined, 4)}</div>
            <div className="mt-0.5 text-[11px] text-mute">won — refine to claim</div>
          </div>
          <div className="rounded-xl border border-line bg-ink/40 p-3">
            <div className="text-[11px] uppercase tracking-wide text-mute">Refined DRIP</div>
            <div className="mt-0.5 flex items-center gap-1 text-xl font-semibold text-white"><Drip /> {fmt(claimed, 4)}</div>
            <div className="mt-0.5 text-[11px] text-mute">in your wallet</div>
          </div>
        </div>
        <button onClick={claim} disabled={unrefined <= 0}
          className="mt-3 w-full rounded-xl bg-lime py-3 text-sm font-semibold text-ink disabled:cursor-not-allowed disabled:bg-lime/30 disabled:text-ink/60">
          {unrefined > 0 ? `Refine ${fmt(unrefined, 4)} DRIP → wallet (−10%)` : "Nothing to refine yet"}
        </button>
        <div className="mt-2 text-center text-[11px] text-mute">Refining taxes 10% to holders who haven&rsquo;t claimed — hold longer, earn more.</div>
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
