"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAccount, useReadContract, useWriteContract } from "wagmi";
import { parseUnits, maxUint256 } from "viem";
import { AppChrome } from "@/components/AppChrome";
import { Faucet } from "@/components/Faucet";
import { addresses, contractsReady, gridMineAbi, erc20Abi } from "@/lib/contracts";
import { useLiveRound } from "@/lib/useLiveRound";
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
  const { address, isConnected } = useAccount();
  const connected = isConnected && contractsReady; // wallet connected + testnet contracts configured
  const chain = useLiveRound(connected); // live on-chain round state
  const live = connected && chain.ready; // showing real chain data
  const { writeContractAsync } = useWriteContract();
  // Current USDG allowance for GridMine — so we only approve once (max), not every round.
  const allowance = useReadContract({
    address: (addresses.usdg || undefined) as `0x${string}` | undefined,
    abi: erc20Abi, functionName: "allowance",
    args: address && addresses.gridMine ? [address, addresses.gridMine as `0x${string}`] : undefined,
    query: { enabled: live && !!address && !!addresses.usdg, refetchInterval: 10000 },
  });
  const [txMsg, setTxMsg] = useState<string | null>(null);
  const [advancing, setAdvancing] = useState(false);
  const [mode, setMode] = useState<"lite" | "pro">("pro");
  const [tiles, setTiles] = useState<Tile[]>(empty);
  const [selected, setSelected] = useState<number[]>([]);
  const [amount, setAmount] = useState(10);
  const [usdg, setUsdg] = useState(START_USDG);
  const [unrefined, setUnrefined] = useState(0); // DRIP won this round(s), not yet refined
  const [claimed, setClaimed] = useState(0); // refined DRIP, in wallet
  const [usdgWon, setUsdgWon] = useState(0); // USDG winnings, claimable (like ORE's SOL)
  const [nvdaWon, setNvdaWon] = useState(0); // NVDA won this round(s) — the 4% winners' slice
  const [showRewards, setShowRewards] = useState(false); // rewards/claim overlay
  const [claimPct, setClaimPct] = useState(100);
  const [motherlode, setMotherlode] = useState(26);
  const [timeLeft, setTimeLeft] = useState<number>(gridMine.roundSeconds);
  const [round, setRound] = useState(397203);
  const [last, setLast] = useState<{ tile: number; solo: boolean; winner: string } | null>({ tile: 13, solo: false, winner: "KingAmadán" });
  const [result, setResult] = useState<null | { tile: number; won: boolean; usdgDelta: number; drip: number; nvda: number; solo: boolean; soloYou: boolean; motherlodeHit: boolean }>(null);
  const [revealing, setRevealing] = useState(false); // "finding the winner" animation phase
  const [revealTile, setRevealTile] = useState<number | null>(null);
  const [sparkles] = useState<boolean[]>(() => Array.from({ length: N }, () => Math.random() < 0.4));

  const pool = useMemo(() => tiles.reduce((s, t) => s + t.mine + t.others, 0), [tiles]);
  const targets = mode === "lite" ? Array.from({ length: N }, (_, i) => i) : selected;
  const busy = !!result || revealing;
  // When live, the header + grid + timer reflect the chain; otherwise the demo drives them.
  const tilesShown: Tile[] = live ? chain.tiles.map((a) => ({ mine: 0, others: a })) : tiles;
  const poolShown = live ? chain.pool : pool;
  const timeShown = live ? chain.timeLeft : timeLeft;
  const motherlodeShown = live ? chain.motherlode : motherlode;
  const roundShown = live ? chain.round : round;
  const canDeploy = !busy && amount > 0 && targets.length > 0 && (live ? true : amount <= usdg);

  const toggle = (i: number) => {
    if (busy) return;
    setSelected((s) => (s.includes(i) ? s.filter((x) => x !== i) : [...s, i]));
  };

  // Live on-chain deploy: one transaction for all selected tiles (deployMany). The amount is split
  // evenly across the selected tiles. USDG is approved ONCE (max) — after that, deploys are a single
  // signature each round, which matters when a round is only 60s.
  const doDeploy = async () => {
    if (!live) { deployNow(); return; }
    if (targets.length === 0) { setTxMsg("Select at least one tile to deploy."); return; }
    try {
      const total = parseUnits(String(amount), 6);
      const n = BigInt(targets.length);
      const per = total / n;
      if (per === BigInt(0)) { setTxMsg("Amount too small to split across that many tiles."); return; }
      const remainder = total - per * n; // dust from integer division → folded into the first tile
      const tilesArg = targets.map((t) => t); // uint8[]
      const amountsArg = targets.map((_, i) => (i === 0 ? per + remainder : per)); // uint256[]
      // Approve once (max) only if the current allowance can't cover this deploy.
      const cur = (allowance.data as bigint | undefined) ?? BigInt(0);
      if (cur < total) {
        setTxMsg("Approve USDG (one time)…");
        await writeContractAsync({ address: addresses.usdg as `0x${string}`, abi: erc20Abi, functionName: "approve", args: [addresses.gridMine as `0x${string}`, maxUint256] });
      }
      setTxMsg(`Deploying to ${targets.length} tile${targets.length > 1 ? "s" : ""}…`);
      await writeContractAsync({ address: addresses.gridMine as `0x${string}`, abi: gridMineAbi, functionName: "deployMany", args: [tilesArg, amountsArg] });
      setTxMsg(`Deployed on-chain to ${targets.length} tile${targets.length > 1 ? "s" : ""} ✓`);
      setSelected([]);
      setTimeout(() => { chain.refetch(); allowance.refetch(); }, 3000);
    } catch (e) {
      setTxMsg(e instanceof Error ? e.message.slice(0, 120) : "deploy failed");
    }
  };

  // Advance the on-chain round: (optionally) seed a fresh random word, close the expired round, and
  // process rewards for the round that just settled. `closeRound`/`processRewards` are permissionless,
  // so any connected wallet (with gas) can drive the game — this stands in for the server keeper while
  // testing. On mainnet a keeper cron does this automatically every round.
  const advanceRound = async () => {
    if (!live || advancing) return;
    setAdvancing(true);
    const settling = chain.round; // the currently-open round that will settle on close
    try {
      if (addresses.randomness) {
        try {
          const bytes = new Uint8Array(32);
          crypto.getRandomValues(bytes);
          const word = BigInt("0x" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(""));
          const setWordAbi = [{ type: "function", name: "setWord", stateMutability: "nonpayable", inputs: [{ type: "uint256" }], outputs: [] }] as const;
          setTxMsg("Seeding randomness…");
          await writeContractAsync({ address: addresses.randomness as `0x${string}`, abi: setWordAbi, functionName: "setWord", args: [word] });
        } catch { /* non-fatal — closeRound still works with the last word */ }
      }
      setTxMsg("Closing round…");
      await writeContractAsync({ address: addresses.gridMine as `0x${string}`, abi: gridMineAbi, functionName: "closeRound" });
      try {
        setTxMsg("Processing rewards…");
        await writeContractAsync({ address: addresses.gridMine as `0x${string}`, abi: gridMineAbi, functionName: "processRewards", args: [BigInt(settling), BigInt(0), BigInt(0)] });
      } catch { /* nothing to process (empty round) */ }
      setTxMsg("New round started ✓");
      setTimeout(() => chain.refetch(), 3000);
    } catch (e) {
      setTxMsg(e instanceof Error ? e.message.slice(0, 120) : "advance failed");
    } finally {
      setAdvancing(false);
    }
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
    let usdgDelta = 0, drip = 0, nvda = 0, solo = false, soloYou = false, motherlodeHit = false, newMotherlode = motherlode;
    if (winnerStake > 0) {
      const cut = (loserStake * gridMine.loserCutBps) / 10000;
      const winnerPot = loserStake - cut;
      if (mine > 0) usdgDelta = mine + (winnerPot * mine) / winnerStake;
      const winnersDrip = (cut * gridMine.cutSplitWinnersBps) / 10000;
      // 4% of the cut buys NVDA for the winners (USDG value → NVDA units at the demo price).
      const nvdaPool = (cut * gridMine.cutSplitWinnersNvdaBps) / 10000 / gridMine.nvdaPrice;
      const motherAdd = (cut * gridMine.cutSplitMotherlodeBps) / 10000;
      let payoutPool = winnersDrip;
      const next = motherlode + motherAdd;
      if (Math.random() * gridMine.motherlodeOdds < 1) { motherlodeHit = true; payoutPool += next; newMotherlode = 0; }
      else newMotherlode = Math.round(next * 100) / 100;
      solo = Math.random() < 1 / gridMine.soloOdds;
      if (mine > 0) {
        if (solo) {
          soloYou = Math.random() < mine / winnerStake;
          drip = soloYou ? payoutPool : 0;
          nvda = soloYou ? nvdaPool : 0;
        } else {
          drip = (payoutPool * mine) / winnerStake;
          nvda = (nvdaPool * mine) / winnerStake;
        }
      }
    }
    return { tile, usdgDelta, drip, nvda, solo, soloYou, motherlodeHit, newMotherlode };
  }, [tiles, motherlode]);

  const applyOutcome = useCallback((o: ReturnType<typeof computeOutcome>) => {
    setMotherlode(o.newMotherlode);
    // USDG winnings accrue as a claimable balance (like ORE's SOL) instead of auto-crediting.
    if (o.usdgDelta > 0) setUsdgWon((w) => Math.round((w + o.usdgDelta) * 100) / 100);
    if (o.drip > 0) setUnrefined((d) => Math.round((d + o.drip) * 1e6) / 1e6);
    if (o.nvda > 0) setNvdaWon((n) => Math.round((n + o.nvda) * 1e6) / 1e6);
    setResult({ tile: o.tile, won: o.usdgDelta > 0, usdgDelta: o.usdgDelta, drip: o.drip, nvda: o.nvda, solo: o.solo, soloYou: o.soloYou, motherlodeHit: o.motherlodeHit });
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

  const claim = (pct = 100) => {
    const amt = (unrefined * pct) / 100;
    if (amt <= 0) return;
    setClaimed((c) => Math.round((c + amt * (1 - gridMine.refineFeeBps / 10000)) * 1e6) / 1e6);
    setUnrefined((u) => Math.max(0, Math.round((u - amt) * 1e6) / 1e6));
  };

  const claimUsdg = () => {
    if (usdgWon <= 0) return;
    setUsdg((u) => Math.round((u + usdgWon) * 100) / 100);
    setUsdgWon(0);
  };

  // Populate the grid on the client (avoids an SSR/client hydration mismatch from Math.random).
  useEffect(() => { setTiles(seeded()); }, []);

  // Countdown — demo only (when live, the chain + keeper drive the round). At zero, run the reveal.
  useEffect(() => {
    if (busy || live) return;
    if (timeLeft <= 0) { startReveal(); return; }
    const id = setTimeout(() => setTimeLeft((t) => t - 1), 1000);
    return () => clearTimeout(id);
  }, [timeLeft, busy, live, startReveal]);

  // Auto-advance to the next round a few seconds after settlement.
  useEffect(() => {
    if (!result) return;
    const id = setTimeout(nextRound, 4500);
    return () => clearTimeout(id);
  }, [result, nextRound]);

  const mm = String(Math.floor(timeShown / 60)).padStart(2, "0");
  const ss = String(timeShown % 60).padStart(2, "0");

  return (
    <AppChrome>
      {/* Stat header */}
      <div className="grid grid-cols-3 px-4 py-6 text-center">
        <Stat label="DEPLOYED" value={fmt(poolShown)} accent />
        <Stat label="MOTHERLODE" value={fmt(motherlodeShown, 0)} gold border />
        <Stat label="TIME" value={result ? "00:00" : revealing ? "···" : `${mm}:${ss}`} danger={!busy && timeShown <= 10} />
      </div>

      {/* Live testnet balance + faucet (only when a wallet is connected and contracts are configured) */}
      <Faucet />

      {/* On-chain round control. When live and the round window has elapsed, the round is frozen until
          someone calls closeRound() — this button does it (permissionless) so a fresh round starts.
          On mainnet a keeper cron does this automatically; this is for testing without a keeper. */}
      {live && timeShown === 0 && (
        <div className="mx-4 mt-4 rounded-2xl border border-lime/40 bg-lime/10 p-4">
          <div className="text-sm font-semibold text-white">Round #{roundShown} ended</div>
          <div className="mt-0.5 text-[11px] text-mute">
            On-chain rounds don&rsquo;t auto-advance without a keeper. Tap to settle it and start a fresh 60s round.
          </div>
          <button onClick={advanceRound} disabled={advancing} className="mt-3 w-full rounded-xl bg-lime py-2.5 text-sm font-semibold text-ink disabled:opacity-60">
            {advancing ? "Working…" : "Start next round"}
          </button>
          {txMsg && <p className="mt-2 text-center text-[11px] text-lime">{txMsg}</p>}
        </div>
      )}

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
              {tilesShown.map((t, i) => {
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
            <Row label="REWARDS">
              <button onClick={() => setShowRewards(true)} className="flex items-center gap-1.5 font-semibold text-white">
                <span className="flex items-center gap-1"><Usdg /> {fmt(usdgWon, 2)}</span>
                <span className="text-mute">+</span>
                <span className="flex items-center gap-1"><Drip /> {fmt(unrefined, 4)}</span>
                <span className="text-mute">+</span>
                <span className="flex items-center gap-1"><Nvda /> {fmt(nvdaWon, 4)}</span>
                <span className="text-mute/70">›</span>
              </button>
            </Row>
          </div>

          <button disabled={!canDeploy} onClick={doDeploy}
            className="mt-5 w-full rounded-2xl bg-lime py-4 text-base font-semibold text-ink transition-transform enabled:hover:scale-[1.01] disabled:cursor-not-allowed disabled:bg-panel disabled:text-mute">
            {mode === "pro" && selected.length === 0
              ? "Select tiles to deploy"
              : `Deploy ${fmt(amount, amount % 1 ? 2 : 0)} USDG${live ? " on-chain" : ""}${targets.length > 1 ? ` · ${targets.length} tiles` : ""}`}
          </button>
          <div className="mt-2 flex justify-between text-xs text-mute">
            <span>{live ? "On-chain · testnet" : `Wallet ${fmt(usdg)} USDG`}</span>
            <span>1% entry fee → {fmt(amount * gridMine.adminFeeBps / 10000, 2)} USDG</span>
          </div>
          {txMsg && <p className="mt-2 text-center text-[11px] text-lime">{txMsg}</p>}
          {live && (
            <p className="mt-1 text-center text-[11px] text-mute/70">
              Deploy spends your real testnet USDG. Winnings &amp; refining still read the demo — wiring next.
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
        <div className="mt-3 flex items-center justify-between rounded-xl border border-line bg-ink/40 p-3">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-mute">NVDA won</div>
            <div className="mt-0.5 text-[11px] text-mute">4% of each round&rsquo;s cut buys NVDA for winners</div>
          </div>
          <div className="flex items-center gap-1 text-xl font-semibold text-white"><Nvda /> {fmt(nvdaWon, 4)}</div>
        </div>
        <button onClick={() => setShowRewards(true)} disabled={unrefined <= 0}
          className="mt-3 w-full rounded-xl bg-lime py-3 text-sm font-semibold text-ink disabled:cursor-not-allowed disabled:bg-lime/30 disabled:text-ink/60">
          {unrefined > 0 ? "Refine & claim" : "Nothing to refine yet"}
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
        {live
          ? "On-chain · Robinhood Chain. A game of chance; not available where prohibited."
          : "Demo · fake funds, no chain. A game of chance; not available where prohibited."}
      </p>

      {/* Rewards / claim overlay (ORE-style: pick a %, see the refining fee, claim). */}
      {showRewards && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60" onClick={() => setShowRewards(false)}>
          <div className="mx-auto w-full max-w-md rounded-t-3xl border-t border-line bg-ink px-5 pb-8 pt-5" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-line" />
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight text-white">Rewards</h2>
                <p className="text-sm text-mute">Refine your DRIP into your wallet.</p>
              </div>
              <button onClick={() => setShowRewards(false)} className="text-mute hover:text-white" aria-label="Close">✕</button>
            </div>

            <div className="mt-6 text-center text-6xl font-semibold text-white">{claimPct}%</div>

            <div className="mt-6 grid grid-cols-4 gap-2">
              {[25, 50, 75, 100].map((p) => (
                <button key={p} onClick={() => setClaimPct(p)}
                  className={`rounded-full py-3 text-sm font-semibold ${claimPct === p ? "bg-white text-ink" : "bg-panel text-white hover:bg-panel2"}`}>
                  {p === 100 ? "MAX" : `${p}%`}
                </button>
              ))}
            </div>

            <div className="mt-6 space-y-3 text-sm">
              <Row label="You receive">
                <span className="flex items-center gap-1 font-semibold text-white"><Drip /> {fmt(unrefined * claimPct / 100 * (1 - gridMine.refineFeeBps / 10000), 4)}</span>
              </Row>
              <Row label={`Refining fee (${gridMine.refineFeeBps / 100}%)`}>
                <span className="flex items-center gap-1 font-semibold text-mute"><Drip /> {fmt(unrefined * claimPct / 100 * (gridMine.refineFeeBps / 10000), 4)}</span>
              </Row>
            </div>

            <button
              onClick={() => { claim(claimPct); setShowRewards(false); }}
              disabled={unrefined <= 0}
              className="mt-5 w-full rounded-2xl bg-lime py-4 text-base font-semibold text-ink disabled:cursor-not-allowed disabled:bg-panel disabled:text-mute">
              {unrefined > 0 ? "Claim DRIP" : "Nothing to claim"}
            </button>

            <div className="mt-6">
              <h3 className="text-sm font-semibold text-white">Balances</h3>
              <div className="mt-3 space-y-3 text-sm">
                <Row label="Unrefined DRIP"><span className="flex items-center gap-1 font-semibold text-white"><Drip /> {fmt(unrefined, 6)}</span></Row>
                <Row label="Refined DRIP (wallet)"><span className="flex items-center gap-1 font-semibold text-white"><Drip /> {fmt(claimed, 6)}</span></Row>
                <Row label="NVDA won"><span className="flex items-center gap-1 font-semibold text-white"><Nvda /> {fmt(nvdaWon, 6)}</span></Row>
                <Row label="USDG won"><span className="flex items-center gap-1 font-semibold text-white"><Usdg /> {fmt(usdgWon)}</span></Row>
              </div>
            </div>

            <button
              onClick={() => { claimUsdg(); setShowRewards(false); }}
              disabled={usdgWon <= 0}
              className="mt-4 w-full rounded-2xl bg-white py-4 text-base font-semibold text-ink disabled:cursor-not-allowed disabled:bg-panel disabled:text-mute">
              {usdgWon > 0 ? `Claim ${fmt(usdgWon)} USDG` : "No USDG to claim"}
            </button>
          </div>
        </div>
      )}
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

// NVDA glyph — the tokenized-NVIDIA reward. A neutral "N" chip in the app's palette (not the
// NVIDIA brand mark). Used for the 4% winners' NVDA slice.
function Nvda({ big }: { big?: boolean }) {
  const s = big ? 22 : 14;
  return (
    <span
      style={{ width: s, height: s, fontSize: s * 0.6 }}
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-lime font-bold leading-none text-ink"
      aria-label="NVDA"
    >
      N
    </span>
  );
}
