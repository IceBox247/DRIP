"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { gridMine } from "@/lib/site";

// Grid Mine — interactive DEMO mirroring contracts/src/game/GridMine.sol. Simulated locally with
// fake funds (no wallet, no chain). Round math matches the contract: 1% admin, 90% of the loser pot
// to winners (USDG), the 10% cut buys DRIP split 70/10/10/10, 1-or-all (50% one winner takes the
// DRIP, 50% shared), 1/625 motherlode, 10% refine tax on claim.

type Tile = { mine: number; others: number };
const N = gridMine.tiles; // 25
const START_USDG = 1000;

function seedOthers(): Tile[] {
  return Array.from({ length: N }, () => ({
    mine: 0,
    others: Math.random() < 0.6 ? Math.round((10 + Math.random() * 60) * 100) / 100 : 0,
  }));
}
const fmt = (n: number, d = 2) =>
  n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

export default function GamePage() {
  const [entered, setEntered] = useState(false);
  const [round, setRound] = useState(1);
  const [tiles, setTiles] = useState<Tile[]>(seedOthers);
  const [amount, setAmount] = useState(10);
  const [usdg, setUsdg] = useState(START_USDG);
  const [unrefined, setUnrefined] = useState(0);
  const [claimed, setClaimed] = useState(0);
  const [motherlode, setMotherlode] = useState(0.4);
  const [protocolCutTotal, setProtocolCutTotal] = useState(0);
  const [timeLeft, setTimeLeft] = useState<number>(gridMine.roundSeconds);
  const [result, setResult] = useState<null | {
    tile: number;
    won: boolean;
    usdgDelta: number;
    drip: number;
    solo: boolean;
    soloYou: boolean;
    motherlodeHit: boolean;
  }>(null);
  const [history, setHistory] = useState<{ round: number; tile: number; won: boolean }[]>([]);

  const myStaked = useMemo(() => tiles.reduce((s, t) => s + t.mine, 0), [tiles]);

  const deploy = useCallback(
    (i: number) => {
      if (result || amount <= 0 || amount > usdg) return;
      setUsdg((u) => Math.round((u - amount) * 100) / 100);
      setTiles((ts) => ts.map((t, j) => (j === i ? { ...t, mine: t.mine + amount } : t)));
    },
    [amount, usdg, result],
  );

  const settle = useCallback(() => {
    const gross = tiles.reduce((s, t) => s + t.mine + t.others, 0);
    const tile = Math.floor(Math.random() * N);
    const winnerStake = tiles[tile].mine + tiles[tile].others;
    const mine = tiles[tile].mine;
    const loserStake = gross - winnerStake;
    const admin = Math.min((gross * gridMine.adminFeeBps) / 10000, loserStake);
    const remainingLoser = loserStake - admin;

    let usdgDelta = 0;
    let drip = 0;
    let solo = false;
    let soloYou = false;
    let motherlodeHit = false;
    let cut = remainingLoser;

    if (winnerStake > 0) {
      cut = (remainingLoser * gridMine.loserCutBps) / 10000;
      const winnerPot = remainingLoser - cut;
      if (mine > 0) usdgDelta = mine + (winnerPot * mine) / winnerStake; // USDG always pro-rata

      // The cut "buys DRIP"; winners' slice is 10% of it (demo: 1 unit of USDG ~ 1 DRIP).
      const winnersDrip = (cut * gridMine.cutSplitWinnersBps) / 10000;
      const motherAdd = (cut * gridMine.cutSplitMotherlodeBps) / 10000;
      let pool = winnersDrip;
      const next = motherlode + motherAdd;
      if (Math.random() * gridMine.motherlodeOdds < 1) {
        motherlodeHit = true;
        pool += next;
        setMotherlode(0);
      } else {
        setMotherlode(next);
      }
      // 1-or-all
      solo = Math.random() < 1 / gridMine.soloOdds;
      if (mine > 0) {
        if (solo) {
          soloYou = Math.random() < mine / winnerStake; // weighted by your stake
          drip = soloYou ? pool : 0;
        } else {
          drip = (pool * mine) / winnerStake;
        }
      }
    }

    if (usdgDelta > 0) setUsdg((u) => Math.round((u + usdgDelta) * 100) / 100);
    if (drip > 0) setUnrefined((d) => Math.round((d + drip) * 1e6) / 1e6);
    setProtocolCutTotal((p) => Math.round((p + cut) * 100) / 100);
    setResult({ tile, won: usdgDelta > 0, usdgDelta, drip, solo, soloYou, motherlodeHit });
    setHistory((h) => [{ round, tile, won: usdgDelta > 0 }, ...h].slice(0, 8));
  }, [tiles, motherlode, round]);

  const nextRound = useCallback(() => {
    setRound((r) => r + 1);
    setTiles(seedOthers());
    setResult(null);
    setTimeLeft(gridMine.roundSeconds);
  }, []);

  const claim = useCallback(() => {
    if (unrefined <= 0) return;
    const fee = (unrefined * gridMine.refineFeeBps) / 10000;
    setClaimed((c) => Math.round((c + (unrefined - fee)) * 1e6) / 1e6);
    setUnrefined(0);
  }, [unrefined]);

  useEffect(() => {
    if (!entered || result) return;
    if (timeLeft <= 0) {
      settle();
      return;
    }
    const id = setTimeout(() => setTimeLeft((t) => t - 1), 1000);
    return () => clearTimeout(id);
  }, [entered, timeLeft, result, settle]);

  const pct = Math.max(0, Math.min(100, (timeLeft / gridMine.roundSeconds) * 100));

  return (
    <>
      <Nav />
      <div className="border-b border-line/70 bg-panel/50">
        <div className="mx-auto max-w-content px-5 py-2.5 text-xs text-mute">
          <span className="mr-2 inline-flex items-center gap-2 rounded-full border border-lime/40 bg-lime/10 px-2.5 py-0.5 font-medium text-lime">
            Demo
          </span>
          Simulated locally with fake funds — no wallet, no chain. The real Grid Mine runs on{" "}
          {gridMine.deployAsset} on Robinhood Chain. A game of chance; not available where prohibited.
        </div>
      </div>

      {!entered ? (
        // ── Entry screen ──────────────────────────────────────────────────────
        <main className="hero-glow relative overflow-hidden">
          <div className="pointer-events-none absolute inset-0 grid-bg" aria-hidden="true" />
          <div className="relative mx-auto flex min-h-[70vh] max-w-content flex-col items-center justify-center px-5 py-16 text-center">
            <div className="grid grid-cols-5 gap-1.5 mb-8 w-full max-w-xs">
              {Array.from({ length: N }, (_, i) => (
                <div
                  key={i}
                  className={`aspect-square rounded-md border ${i === 12 ? "border-lime bg-lime/25" : "border-line bg-panel"}`}
                />
              ))}
            </div>
            <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              Enter the Mining Grid
            </h1>
            <p className="mt-4 max-w-lg text-mute">
              Deploy {gridMine.deployAsset} onto a 5×5 grid. Every {gridMine.roundSeconds}s one tile
              wins. Winners split the pot in {gridMine.deployAsset} and earn DRIP — 50% of rounds one
              player takes all the DRIP.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-2 text-xs">
              {["25 tiles", "60s rounds", "Win USDG + DRIP", "1/625 motherlode 🎰"].map((c) => (
                <span key={c} className="rounded-full border border-line bg-panel px-3 py-1 text-mute">
                  {c}
                </span>
              ))}
            </div>
            <button
              onClick={() => setEntered(true)}
              className="mt-9 rounded-xl bg-lime px-8 py-4 text-base font-semibold text-ink transition-transform hover:scale-[1.03] active:scale-100"
            >
              Enter the Mining Grid →
            </button>
            <p className="mt-3 text-xs text-mute/70">Free demo · fake balance of 1,000 {gridMine.deployAsset}</p>
          </div>
        </main>
      ) : (
        <main className="mx-auto grid max-w-content gap-6 px-5 py-8 lg:grid-cols-[1fr_320px]">
          <section>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="text-2xl font-semibold text-white">Grid Mine</h1>
                <p className="text-sm text-mute">Round {round} · tap tiles to deploy {gridMine.deployAsset}</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-28 rounded-xl border border-line bg-panel px-3 py-2">
                  <div className="text-[10px] uppercase tracking-wide text-mute">Time left</div>
                  <div className="font-mono text-lg font-semibold text-white">{result ? "—" : `${timeLeft}s`}</div>
                  <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-line">
                    <div className="h-full bg-lime transition-all duration-1000" style={{ width: `${result ? 100 : pct}%` }} />
                  </div>
                </div>
                {result ? (
                  <button onClick={nextRound} className="rounded-lg bg-lime px-4 py-2.5 text-sm font-semibold text-ink">
                    Next round
                  </button>
                ) : (
                  <button onClick={settle} className="rounded-lg border border-line bg-panel px-4 py-2.5 text-sm font-semibold text-white hover:border-mute/50">
                    Settle now
                  </button>
                )}
              </div>
            </div>

            {result && (
              <div className={`mb-4 rounded-xl border p-4 text-sm ${result.won ? "border-lime/40 bg-lime/10 text-white" : "border-line bg-panel text-mute"}`}>
                <span className="font-semibold text-white">Tile {result.tile} won.</span>{" "}
                {result.won
                  ? `You collected ${fmt(result.usdgDelta)} ${gridMine.deployAsset}` +
                    (result.solo
                      ? result.soloYou
                        ? ` and — SOLO ROUND — took ALL ${fmt(result.drip, 4)} DRIP 🏆`
                        : ` (solo round — the DRIP went to one other winner)`
                      : ` and ${fmt(result.drip, 4)} DRIP`) +
                    (result.motherlodeHit ? " · 🎰 MOTHERLODE!" : "") + "."
                  : "No stake on the winning tile this round."}
              </div>
            )}

            <div className="grid grid-cols-5 gap-2">
              {tiles.map((t, i) => {
                const isWinner = result?.tile === i;
                const total = t.mine + t.others;
                return (
                  <button
                    key={i}
                    onClick={() => deploy(i)}
                    disabled={!!result}
                    className={`group relative aspect-square rounded-xl border p-2 text-left transition-all ${
                      isWinner
                        ? "border-lime bg-lime/25 ring-2 ring-lime/50 scale-[1.03]"
                        : t.mine > 0
                          ? "border-lime/50 bg-panel2"
                          : "border-line bg-panel hover:border-lime/40 hover:bg-panel2"
                    } ${result ? "cursor-default" : "cursor-pointer active:scale-95"}`}
                  >
                    <div className="text-[10px] text-mute/60">#{i}</div>
                    <div className="mt-1 text-xs font-semibold text-white">{fmt(total, 0)}</div>
                    {t.mine > 0 && <div className="text-[10px] font-medium text-lime">you {fmt(t.mine, 0)}</div>}
                  </button>
                );
              })}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-panel p-4">
              <span className="text-sm text-mute">Stake per tap</span>
              <div className="flex items-center gap-2">
                {[10, 25, 50, 100].map((v) => (
                  <button
                    key={v}
                    onClick={() => setAmount(v)}
                    className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${amount === v ? "border-lime bg-lime/10 text-lime" : "border-line bg-ink text-mute hover:text-white"}`}
                  >
                    {v}
                  </button>
                ))}
              </div>
              <span className="ml-auto text-sm text-mute">Tap a tile → deploy {fmt(amount, 0)} {gridMine.deployAsset}</span>
            </div>
          </section>

          <aside className="flex flex-col gap-4">
            <Stat label={`Wallet (${gridMine.deployAsset})`} value={fmt(usdg)} />
            <Stat label="Staked this round" value={fmt(myStaked)} sub={`${gridMine.deployAsset}, at risk`} />
            <div className="rounded-2xl border border-line bg-panel p-5">
              <div className="text-sm text-mute">Unrefined DRIP</div>
              <div className="mt-1 text-2xl font-semibold text-white">{fmt(unrefined, 4)}</div>
              <button
                onClick={claim}
                disabled={unrefined <= 0}
                className="mt-3 w-full rounded-lg bg-lime px-4 py-2 text-sm font-semibold text-ink disabled:cursor-not-allowed disabled:bg-lime/30 disabled:text-ink/60"
              >
                Claim (10% refine tax)
              </button>
              <div className="mt-2 text-xs text-mute">Claimed to wallet: {fmt(claimed, 4)} DRIP</div>
            </div>
            <Stat label="Motherlode 🎰" value={`${fmt(motherlode, 2)} DRIP`} sub="1 / 625 per round" />
            <Stat label="Protocol cut → buyback" value={`${fmt(protocolCutTotal)} ${gridMine.deployAsset}`} sub={`buys DRIP, burns ${gridMine.cutSplitBurnBps / 100}%`} />
            <div className="rounded-2xl border border-line bg-panel p-5">
              <div className="mb-2 text-sm text-mute">Recent winners</div>
              <div className="flex flex-col gap-1 text-sm">
                {history.length === 0 && <span className="text-mute/60">No rounds yet</span>}
                {history.map((h, k) => (
                  <div key={k} className="flex justify-between">
                    <span className="text-mute">Round {h.round}</span>
                    <span className={h.won ? "text-lime" : "text-mute"}>tile {h.tile}{h.won ? " · you won" : ""}</span>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </main>
      )}
      <Footer />
    </>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-panel p-5">
      <div className="text-sm text-mute">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-white">{value}</div>
      {sub && <div className="mt-1 text-xs text-mute">{sub}</div>}
    </div>
  );
}
