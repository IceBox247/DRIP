"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAccount, usePublicClient, useReadContract, useWriteContract } from "wagmi";
import { parseUnits } from "viem";
import { AppChrome } from "@/components/AppChrome";
import { Faucet } from "@/components/Faucet";
import { addresses, contractsReady, gridMineAbi, erc20Abi } from "@/lib/contracts";
import { useLiveRound } from "@/lib/useLiveRound";
import { useLiveMiners } from "@/lib/useLiveMiners";
import { usePendingWinnings } from "@/lib/usePendingWinnings";
import { useRoundHistory } from "@/lib/useRoundHistory";
import { compact, friendlyError } from "@/lib/format";
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
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`; // 0x1234…abcd

// RefiningVault: DRIP won accrues here; refine (claim) sends it to your wallet minus the 10% tax.
const refiningAbi = [
  { type: "function", name: "claimable", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "claim", stateMutability: "nonpayable", inputs: [{ type: "uint256" }], outputs: [] },
] as const;

const MINERS = [
  { a: "55nF…mqjh", t: 25, v: 0.63 }, { a: "7ibJ…PU4B", t: 15, v: 0.6 }, { a: "7chh…wC4f", t: 25, v: 0.59 },
  { a: "5c4R…VHcq", t: 15, v: 0.47 }, { a: "8bc6…7rti", t: 25, v: 0.33 }, { a: "NotZohran", t: 15, v: 0.3 },
  { a: "HA36…rpMB", t: 10, v: 0.2 }, { a: "7wfh…VKse", t: 25, v: 0.2 }, { a: "H8VM…66bA", t: 15, v: 0.15 },
];

export default function MinePage() {
  const { address, isConnected } = useAccount();
  // Live on-chain round reads only need the RPC, not a wallet — so visitors see the REAL round before
  // connecting; a wallet is only required to actually deploy. Falls back to the demo only when the
  // contracts aren't configured or the chain isn't reachable.
  const chain = useLiveRound(contractsReady);
  // "Live" = real chain data, NEVER the random demo, whenever the contracts are configured (always on
  // mainnet). We deliberately do NOT wait for chain.ready: a slow first read now shows zeros briefly
  // and then the real values, instead of flashing random demo numbers that change on every refresh.
  const live = contractsReady;
  const chainReady = chain.ready; // real values have loaded (vs. still 0/empty on first paint)
  const liveMiners = useLiveMiners(chain.round, live); // real participants in the current round
  // Unclaimed winnings across every settled round the wallet played (pre-harvest), so you can SEE and
  // harvest each round — not just the latest one.
  const pending = usePendingWinnings(live && isConnected);
  const [showHistory, setShowHistory] = useState(false); // Last round → history modal
  const history = useRoundHistory(live && showHistory, chain.round);
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();
  // Current USDG allowance for GridMine — so we only approve once (max), not every round.
  const allowance = useReadContract({
    address: (addresses.usdg || undefined) as `0x${string}` | undefined,
    abi: erc20Abi, functionName: "allowance",
    args: address && addresses.gridMine ? [address, addresses.gridMine as `0x${string}`] : undefined,
    query: { enabled: live && !!address && !!addresses.usdg, refetchInterval: 10000 },
  });
  // Real winnings reads: refinable DRIP (RefiningVault.claimable), + DRIP/NVDA wallet balances.
  const refiningClaimable = useReadContract({
    address: (addresses.refining || undefined) as `0x${string}` | undefined,
    abi: refiningAbi, functionName: "claimable",
    args: address ? [address] : undefined,
    query: { enabled: live && !!address && !!addresses.refining, refetchInterval: 6000 },
  });
  const dripBal = useReadContract({
    address: (addresses.drip || undefined) as `0x${string}` | undefined,
    abi: erc20Abi, functionName: "balanceOf", args: address ? [address] : undefined,
    query: { enabled: live && !!address && !!addresses.drip, refetchInterval: 6000 },
  });
  const nvdaBal = useReadContract({
    address: (addresses.nvda || undefined) as `0x${string}` | undefined,
    abi: erc20Abi, functionName: "balanceOf", args: address ? [address] : undefined,
    query: { enabled: live && !!address && !!addresses.nvda, refetchInterval: 6000 },
  });
  const [txMsg, setTxMsg] = useState<string | null>(null);
  const [settling, setSettling] = useState(false);
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
  // When live, the header + grid + timer reflect the chain; otherwise the demo drives them. Each tile
  // shows the wallet's OWN stake (mine) and the rest (others), so the total is mine + others.
  const tilesShown: Tile[] = live
    ? (chain.tiles.length === N
        ? chain.tiles.map((tot, i) => ({ mine: chain.mine[i] ?? 0, others: Math.max(0, tot - (chain.mine[i] ?? 0)) }))
        : empty()) // real mode, still loading → zeros (deterministic), never random demo tiles
    : tiles;
  const poolShown = live ? chain.pool : pool;
  const timeShown = live ? chain.timeLeft : timeLeft;
  const motherlodeShown = live ? chain.motherlode : motherlode;
  const roundShown = live ? chain.round : round;
  // Winnings: real on-chain reads when live, demo state otherwise. Unrefined = DRIP in the
  // RefiningVault; Refined = DRIP in your wallet; NVDA = NVDA in your wallet. USDG pot is claimed
  // via Harvest (per settled round), so there's no running "USDG won" to read when live.
  const num = (v: unknown, dec: number) => (v !== undefined ? Number(v as bigint) / 10 ** dec : 0);
  const unrefinedShown = live ? num(refiningClaimable.data, 18) : unrefined; // DRIP harvested into the vault, refinable now
  const claimedShown = live ? num(dripBal.data, 18) : claimed; // refined DRIP in wallet
  const nvdaWonShown = live ? num(nvdaBal.data, 18) : nvdaWon; // NVDA in wallet
  const usdgWonShown = live ? pending.totalUsdg : usdgWon; // USDG still to harvest (claimable)
  // Summary glance numbers (deploy panel's REWARDS row + overlay): total DRIP/NVDA you could walk away
  // with = what's already yours (vault/wallet) plus what's still waiting to be harvested.
  const dripAvailShown = live ? unrefinedShown + pending.totalDrip : unrefined;
  const nvdaAvailShown = live ? nvdaWonShown + pending.totalNvda : nvdaWon;
  const canDeploy = !busy && amount > 0 && targets.length > 0 && (live ? true : amount <= usdg);

  const toggle = (i: number) => {
    if (busy) return;
    setSelected((s) => (s.includes(i) ? s.filter((x) => x !== i) : [...s, i]));
  };

  // Live on-chain deploy: the amount is PER TILE (like ORE) — each selected tile gets `amount`, so
  // the total spent is amount × tiles. One transaction (deployMany). USDG is approved ONCE (max), and
  // we WAIT for that approval to confirm before deploying, so the wallet can estimate deployMany's real
  // gas (it can't while the approve is pending — transferFrom would revert). We deliberately do NOT
  // force a big gas limit: wallets reserve gasLimit×maxFee up front, so a hardcoded 4M limit makes a
  // low-ETH wallet reject the tx ("insufficient ETH") even though the real fee is tiny.
  const doDeploy = async () => {
    if (!live) { deployNow(); return; }
    if (!isConnected) { setTxMsg("Connect your wallet to deploy."); return; }
    if (targets.length === 0) { setTxMsg("Select at least one tile to deploy."); return; }
    try {
      const perTile = parseUnits(String(amount), 6); // amount is per tile
      if (perTile === BigInt(0)) { setTxMsg("Enter an amount greater than 0."); return; }
      const n = BigInt(targets.length);
      const total = perTile * n; // total USDG spent = per-tile × number of tiles
      const tilesArg = targets.map((t) => t); // uint8[]
      const amountsArg = targets.map(() => perTile); // uint256[] — same amount on each tile
      // Approve once (max) only if the current allowance can't cover this deploy, then wait for it to
      // be mined so the deploy's gas estimate succeeds.
      const cur = (allowance.data as bigint | undefined) ?? BigInt(0);
      if (cur < total) {
        // Approve the EXACT amount (not unlimited) so wallets don't flag it as a "malicious / unlimited"
        // approval. Costs one approval when your allowance runs low, but it's the safe, non-scary pattern.
        setTxMsg("Approve USDG…");
        const approveHash = await writeContractAsync({
          address: addresses.usdg as `0x${string}`, abi: erc20Abi, functionName: "approve",
          args: [addresses.gridMine as `0x${string}`, total],
        });
        setTxMsg("Waiting for approval to confirm…");
        if (publicClient) await publicClient.waitForTransactionReceipt({ hash: approveHash });
        await allowance.refetch();
      }
      setTxMsg(`Deploying to ${targets.length} tile${targets.length > 1 ? "s" : ""}…`);
      await writeContractAsync({
        address: addresses.gridMine as `0x${string}`, abi: gridMineAbi, functionName: "deployMany",
        args: [tilesArg, amountsArg],
        // No forced gas limit — the wallet estimates the real (small) fee, so low-ETH wallets work.
      });
      setTxMsg(`Deployed on-chain to ${targets.length} tile${targets.length > 1 ? "s" : ""} ✓`);
      setSelected([]);
      setTimeout(() => { chain.refetch(); allowance.refetch(); }, 3000);
    } catch (e) {
      setTxMsg(friendlyError(e, "Couldn't deploy — please try again."));
    }
  };

  // Settle the finished round and process its rewards (the keeper's job — this button drives it while
  // testing): seed a fresh random word, closeRound() (picks the winner, opens the next round), then
  // processRewards() (swaps the cut to DRIP/NVDA and distributes). Winners then Harvest to claim.
  const settleAndProcess = async () => {
    if (!live || settling) return;
    if (!isConnected) { setTxMsg("Connect your wallet to settle."); return; }
    setSettling(true);
    const settled = chain.round; // the open, expired round that will close
    try {
      if (addresses.randomness) {
        try {
          const bytes = new Uint8Array(32);
          crypto.getRandomValues(bytes);
          const word = BigInt("0x" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(""));
          const setWordAbi = [{ type: "function", name: "setWord", stateMutability: "nonpayable", inputs: [{ type: "uint256" }], outputs: [] }] as const;
          setTxMsg("Seeding randomness…");
          await writeContractAsync({ address: addresses.randomness as `0x${string}`, abi: setWordAbi, functionName: "setWord", args: [word], gas: BigInt(80000) });
        } catch { /* non-fatal */ }
      }
      setTxMsg("Settling round…");
      await writeContractAsync({ address: addresses.gridMine as `0x${string}`, abi: gridMineAbi, functionName: "closeRound", gas: BigInt(1200000) });
      setTxMsg("Buying & distributing DRIP/NVDA…");
      await writeContractAsync({ address: addresses.gridMine as `0x${string}`, abi: gridMineAbi, functionName: "processRewards", args: [BigInt(settled), BigInt(0), BigInt(0)], gas: BigInt(2000000) });
      setTxMsg("Round settled ✓ — winners can now Harvest.");
      setTimeout(() => chain.refetch(), 3000);
    } catch (e) {
      setTxMsg(friendlyError(e, "Couldn't settle the round — please try again."));
    } finally {
      setSettling(false);
    }
  };

  // Winners pull their payout for a settled round: USDG pot (+ DRIP credited to the RefiningVault and
  // NVDA sent to the wallet once rewards are processed).
  const harvest = async (round: number) => {
    if (!isConnected || !round) return;
    try {
      setTxMsg(`Harvesting round #${round}…`);
      await writeContractAsync({ address: addresses.gridMine as `0x${string}`, abi: gridMineAbi, functionName: "harvest", args: [BigInt(round)], gas: BigInt(400000) });
      setTxMsg(`Harvested round #${round} ✓`);
      setTimeout(() => { chain.refetch(); pending.refetch(); refiningClaimable.refetch(); dripBal.refetch(); nvdaBal.refetch(); }, 3000);
    } catch (e) {
      setTxMsg(friendlyError(e, "Couldn't harvest — please try again."));
    }
  };

  // Harvest EVERY round with unclaimed winnings, one signature each (rounds 1, 2, 3… — not just the
  // latest). USDG & NVDA land in your wallet; DRIP moves to "unrefined" (refine it below to claim).
  const harvestAll = async () => {
    if (!isConnected || pending.rounds.length === 0) return;
    const roundsToDo = pending.rounds.map((r) => r.round);
    for (let i = 0; i < roundsToDo.length; i++) {
      const r = roundsToDo[i];
      try {
        setTxMsg(`Harvesting round #${r} (${i + 1}/${roundsToDo.length})…`);
        await writeContractAsync({ address: addresses.gridMine as `0x${string}`, abi: gridMineAbi, functionName: "harvest", args: [BigInt(r)], gas: BigInt(400000) });
      } catch (e) {
        setTxMsg(friendlyError(e, `Couldn't harvest round #${r} — please try again.`));
        return; // stop the batch on the first failure/rejection
      }
    }
    setTxMsg(`Harvested ${roundsToDo.length} round${roundsToDo.length > 1 ? "s" : ""} ✓`);
    setTimeout(() => { chain.refetch(); pending.refetch(); refiningClaimable.refetch(); dripBal.refetch(); nvdaBal.refetch(); }, 3000);
  };

  // Refine `pct`% of the DRIP sitting in the RefiningVault into the wallet (minus the 10% tax). Live
  // path calls RefiningVault.claim; otherwise runs the demo refine.
  const doRefine = async (pct: number) => {
    if (!live) { claim(pct); setShowRewards(false); return; }
    if (!isConnected) { setTxMsg("Connect your wallet to refine."); return; }
    const claimable = refiningClaimable.data as bigint | undefined;
    if (!claimable || claimable === BigInt(0)) { setTxMsg("Nothing to refine yet."); return; }
    const amt = (claimable * BigInt(pct)) / BigInt(100);
    try {
      setTxMsg("Refining DRIP…");
      await writeContractAsync({ address: addresses.refining as `0x${string}`, abi: refiningAbi, functionName: "claim", args: [amt], gas: BigInt(300000) });
      setTxMsg("Refined ✓ — DRIP in your wallet.");
      setShowRewards(false);
      setTimeout(() => { refiningClaimable.refetch(); dripBal.refetch(); }, 3000);
    } catch (e) {
      setTxMsg(friendlyError(e, "Couldn't refine — please try again."));
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

  // Populate the demo grid on the client (avoids an SSR/client hydration mismatch from Math.random).
  // Only in demo mode — on mainnet (contracts configured) the grid is real chain data, never random.
  useEffect(() => { if (!contractsReady) setTiles(seeded()); }, []);

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
        <Stat label="MOTHERLODE" value={compact(motherlodeShown)} gold border />
        <Stat label="TIME" value={result ? "00:00" : revealing ? "···" : `${mm}:${ss}`} danger={!busy && timeShown <= 10} />
      </div>

      {/* Live testnet balance + faucet (only when a wallet is connected and contracts are configured) */}
      <Faucet />

      {/* When live and the round's window has elapsed, it just waits for the next deploy to roll it
          over automatically (the contract settles the finished round inside deployMany). ORE-style —
          no keeper, no "next round" button; deploying drives the game forward. */}
      {/* Round ended → settles AUTOMATICALLY (keeper + lazy rollover on the next deploy). No manual
          button for players. Only shown once real round data has loaded, so it never flashes "Round #0". */}
      {live && chainReady && roundShown > 1 && timeShown === 0 && (
        <div className="mx-4 mt-4 rounded-2xl border border-lime/40 bg-lime/10 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <span className="h-2 w-2 animate-ping rounded-full bg-lime" /> Round #{roundShown} ended — settling…
          </div>
          <div className="mt-1 text-[11px] text-mute">
            The keeper is picking the winner, buying &amp; distributing DRIP/NVDA, and opening the next round — or just deploy again to jump into a fresh one.
          </div>
          {address?.toLowerCase() === "0xa30120ee727b2e540c41400ae4dd60e3b4572cbe" && (
            <button onClick={settleAndProcess} disabled={settling}
              className="mt-3 w-full rounded-xl border border-lime/40 bg-lime/10 py-2 text-xs font-semibold text-lime disabled:opacity-60">
              {settling ? "Settling…" : "Force settle now (admin)"}
            </button>
          )}
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
          <button
            type="button"
            onClick={() => { if (live && roundShown > 1) setShowHistory(true); }}
            disabled={live && roundShown <= 1}
            className="mx-4 mt-4 flex w-[calc(100%-2rem)] items-center justify-between rounded-xl border border-line bg-panel/60 px-4 py-2 text-xs transition-colors enabled:hover:border-mute/50 disabled:cursor-default">
            <span className="uppercase tracking-wide text-mute">Last round</span>
            {live && roundShown <= 1 ? (
              <span className="text-mute">No rounds settled yet</span>
            ) : (
              <span className="flex items-center gap-2 text-mute">
                <span className="flex items-center gap-1"><Grid4 /> {live ? roundShown - 1 : last?.tile}</span>
                {!live && <span className="font-medium text-white/90">{last?.winner}</span>}
                {!live && <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-ink">{last?.solo ? "Solo" : "Split"}</span>}
                <span className="text-white/70">{live ? "History ›" : "›"}</span>
              </span>
            )}
          </button>

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
                    {!live && sparkles[i] && <span className="absolute right-1 top-1 text-[8px] text-white/50">✦</span>}
                    {/* Your own stake on this tile (top) — shown above the tile's total (bottom), like ORE. */}
                    {t.mine > 0 && (
                      <div className="absolute left-1 top-1 flex items-center gap-0.5 text-[10px] font-semibold text-lime">
                        <Usdg /> {fmt(t.mine, t.mine >= 1 ? 2 : 3)}
                      </div>
                    )}
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
            <Row label="PER TILE">
              <span className="flex items-center gap-1 font-semibold text-white"><Usdg /> {fmt(amount, amount % 1 ? 2 : 0)}</span>
            </Row>
            <Row label="TOTAL">
              <span className="flex items-center gap-1 font-semibold text-white"><Usdg /> {fmt(amount * Math.max(1, targets.length), (amount * Math.max(1, targets.length)) % 1 ? 2 : 0)}</span>
            </Row>
            <Row label="REWARDS">
              <button onClick={() => setShowRewards(true)} className="flex items-center gap-1.5 font-semibold text-white">
                <span className="flex items-center gap-1"><Usdg /> {fmt(usdgWonShown, 2)}</span>
                <span className="text-mute">+</span>
                <span className="flex items-center gap-1"><Drip /> {compact(dripAvailShown)}</span>
                <span className="text-mute">+</span>
                <span className="flex items-center gap-1"><Nvda /> {fmt(nvdaAvailShown, 4)}</span>
                <span className="text-mute/70">›</span>
              </button>
            </Row>
          </div>

          <button disabled={!canDeploy} onClick={doDeploy}
            className="mt-5 w-full rounded-2xl bg-lime py-4 text-base font-semibold text-ink transition-transform enabled:hover:scale-[1.01] disabled:cursor-not-allowed disabled:bg-panel disabled:text-mute">
            {live && !isConnected
              ? "Connect wallet to deploy"
              : mode === "pro" && selected.length === 0
              ? "Select tiles to deploy"
              : `Deploy ${fmt(amount * Math.max(1, targets.length), (amount * Math.max(1, targets.length)) % 1 ? 2 : 0)} USDG${live ? " on-chain" : ""}${targets.length > 1 ? ` · ${fmt(amount, amount % 1 ? 2 : 0)}/tile × ${targets.length}` : ""}`}
          </button>
          <div className="mt-2 flex justify-between text-xs text-mute">
            <span>{live ? (isConnected ? "On-chain" : "Live round · connect to play") : `Wallet ${fmt(usdg)} USDG`}</span>
            <span>1% entry fee → {fmt(amount * Math.max(1, targets.length) * gridMine.adminFeeBps / 10000, 2)} USDG</span>
          </div>
          {txMsg && <p className="mt-2 text-center text-[11px] text-lime">{txMsg}</p>}
          {live && (
            <p className="mt-1 text-center text-[11px] text-mute/70">
              Amount is <strong>per tile</strong> — total = amount × tiles. Winnings are live: harvest each settled round below, then refine your DRIP.
            </p>
          )}
        </div>
      )}

      {/* Winnings */}
      <div className="mx-4 mt-6 rounded-2xl border border-line bg-panel p-4">
        {/* Claimable (pre-harvest) winnings — what each settled round you won still owes you. Shows
            BEFORE you harvest, and lets you harvest any round (1, 2, 3…), not just the latest. */}
        {live && pending.rounds.length > 0 && (
          <div className="mb-4 rounded-xl border border-lime/40 bg-lime/10 p-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-white">🎉 You mined — harvest to claim</div>
              <div className="flex items-center gap-2 text-[11px] text-mute">{pending.rounds.length} round{pending.rounds.length > 1 ? "s" : ""}</div>
            </div>
            <div className="mt-2 space-y-1.5">
              {pending.rounds.map((r) => (
                <div key={r.round} className="flex items-center justify-between rounded-lg border border-line bg-ink/40 px-3 py-2 text-xs">
                  <div>
                    <div className="font-semibold text-white">Round #{r.round}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-mute">
                      {r.usdg > 0 && <span className="flex items-center gap-1"><Usdg /> {compact(r.usdg)}</span>}
                      {r.drip > 0 && <span className="flex items-center gap-1"><Drip /> {compact(r.drip)}</span>}
                      {r.nvda > 0 && <span className="flex items-center gap-1"><Nvda /> {fmt(r.nvda, 4)}</span>}
                    </div>
                  </div>
                  <button onClick={() => harvest(r.round)}
                    className="shrink-0 rounded-lg bg-lime px-3 py-1.5 text-xs font-semibold text-ink">Harvest</button>
                </div>
              ))}
            </div>
            {pending.rounds.length > 1 && (
              <button onClick={harvestAll}
                className="mt-2 w-full rounded-xl bg-lime py-2.5 text-sm font-semibold text-ink">
                Harvest all {pending.rounds.length} rounds ({pending.rounds.length} signatures)
              </button>
            )}
            <div className="mt-2 text-[11px] text-mute">
              Harvesting sends USDG &amp; NVDA to your wallet and moves your DRIP to <span className="text-white">Unrefined</span> below — refine it to claim.
            </div>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-line bg-ink/40 p-3">
            <div className="text-[11px] uppercase tracking-wide text-mute">Unrefined DRIP</div>
            <div className="mt-0.5 flex items-center gap-1 text-xl font-semibold text-white"><Drip /> {compact(unrefinedShown)}</div>
            <div className="mt-0.5 text-[11px] text-mute">mined — refine to claim</div>
          </div>
          <div className="rounded-xl border border-line bg-ink/40 p-3">
            <div className="text-[11px] uppercase tracking-wide text-mute">Refined DRIP</div>
            <div className="mt-0.5 flex items-center gap-1 text-xl font-semibold text-white"><Drip /> {compact(claimedShown)}</div>
            <div className="mt-0.5 text-[11px] text-mute">in your wallet</div>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between rounded-xl border border-line bg-ink/40 p-3">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-mute">NVDA mined</div>
            <div className="mt-0.5 text-[11px] text-mute">4% of each round&rsquo;s cut buys NVDA for winners</div>
          </div>
          <div className="flex items-center gap-1 text-xl font-semibold text-white"><Nvda /> {fmt(nvdaWonShown, 4)}</div>
        </div>
        {/* Nothing to harvest right now (live) — a friendly note so the section isn't just balances. */}
        {live && pending.rounds.length === 0 && (
          <div className="mt-3 rounded-xl border border-line bg-ink/40 px-3 py-2.5 text-center text-[11px] text-mute">
            No unclaimed winnings. Win a round (stake on the winning tile) and it&rsquo;ll show here to harvest.
          </div>
        )}
        <button onClick={() => (live ? doRefine(100) : setShowRewards(true))} disabled={unrefinedShown <= 0}
          className="mt-3 w-full rounded-xl bg-lime py-3 text-sm font-semibold text-ink disabled:cursor-not-allowed disabled:bg-lime/30 disabled:text-ink/60">
          {unrefinedShown > 0 ? "Refine & claim" : "Nothing to refine yet"}
        </button>
        <div className="mt-2 text-center text-[11px] text-mute">Refining taxes 10% to holders who haven&rsquo;t claimed — hold longer, earn more.</div>
      </div>

      {/* Miners — real on-chain participants when live; demo sample only in practice mode. */}
      <div className="mx-4 mt-4">
        <div className="mb-2 text-xs uppercase tracking-wide text-mute">Miners</div>
        <div className="divide-y divide-line/60 rounded-2xl border border-line bg-panel">
          {live ? (
            liveMiners.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-mute">No miners yet this round — be the first to deploy.</div>
            ) : (
              liveMiners.map((m) => (
                <div key={m.addr} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <span className="flex items-center gap-2">
                    <span className="h-6 w-6 rounded-full bg-panel2" />
                    <span className="text-white">{short(m.addr)}</span>
                  </span>
                  <span className="flex items-center gap-3 text-mute">
                    <span className="flex items-center gap-1 text-xs"><Grid4 /> {m.tiles}</span>
                    <span className="flex items-center gap-1 font-semibold text-white"><Usdg /> {fmt(m.total, 2)}</span>
                  </span>
                </div>
              ))
            )
          ) : (
            MINERS.map((m) => (
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
            ))
          )}
        </div>
      </div>

      <p className="px-4 py-6 text-center text-[11px] text-mute/60">
        {live
          ? "On-chain · Robinhood Chain. A game of chance; not available where prohibited."
          : "Demo · fake funds, no chain. A game of chance; not available where prohibited."}
      </p>

      {/* Last-round history — real settled rounds from the chain (winning tile, pot, your result). */}
      {showHistory && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60" onClick={() => setShowHistory(false)}>
          <div className="mx-auto max-h-[80vh] w-full max-w-md overflow-y-auto rounded-t-3xl border-t border-line bg-ink px-5 pb-8 pt-5" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-line" />
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight text-white">Round history</h2>
                <p className="text-sm text-mute">Real settled rounds on Robinhood Chain.</p>
              </div>
              <button onClick={() => setShowHistory(false)} className="text-mute hover:text-white" aria-label="Close">✕</button>
            </div>

            <div className="mt-5 space-y-2">
              {history.loading && history.rows.length === 0 && (
                <div className="py-8 text-center text-sm text-mute">Loading…</div>
              )}
              {!history.loading && history.rows.length === 0 && (
                <div className="py-8 text-center text-sm text-mute">No settled rounds yet.</div>
              )}
              {history.rows.map((r) => (
                <div key={r.round} className={`rounded-xl border p-3 ${r.youWon ? "border-lime/40 bg-lime/10" : "border-line bg-panel/60"}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-semibold text-white">
                      Round #{r.round}
                      {r.youWon && <span className="rounded-full bg-lime px-2 py-0.5 text-[10px] font-bold text-ink">YOU WON</span>}
                      {r.motherlodeHit && <span className="rounded-full bg-yellow-500 px-2 py-0.5 text-[10px] font-bold text-ink">🎰 MOTHERLODE</span>}
                    </div>
                    <span className="rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-semibold text-ink">{r.hadWinner ? (r.soloMode ? "Solo" : "Split") : "No winner"}</span>
                  </div>
                  <div className="mt-2 flex items-center gap-1.5 text-[11px] text-mute">
                    <span className="flex items-center gap-1"><Grid4 /> tile {r.winningTile} won</span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    <span className="flex items-center gap-1 text-mute">pool <span className="font-semibold text-white"><Usdg /> {fmt(r.totalIn, 2)}</span></span>
                    <span className="flex items-center gap-1 text-mute">winners <span className="font-semibold text-white"><Usdg /> {fmt(r.winnerPotUsdg, 2)}</span></span>
                    {r.rewardsProcessed
                      ? <span className="flex items-center gap-1 text-mute"><Drip /> <span className="font-semibold text-white">{compact(r.rewardDrip)}</span></span>
                      : <span className="text-yellow-500/80">rewards pending</span>}
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-4 text-center text-[11px] text-mute/60">Showing the most recent settled rounds.</p>
          </div>
        </div>
      )}

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
                <span className="flex items-center gap-1 font-semibold text-white"><Drip /> {compact(unrefinedShown * claimPct / 100 * (1 - gridMine.refineFeeBps / 10000))}</span>
              </Row>
              <Row label={`Refining fee (${gridMine.refineFeeBps / 100}%)`}>
                <span className="flex items-center gap-1 font-semibold text-mute"><Drip /> {compact(unrefinedShown * claimPct / 100 * (gridMine.refineFeeBps / 10000))}</span>
              </Row>
            </div>

            <button
              onClick={() => doRefine(claimPct)}
              disabled={unrefinedShown <= 0}
              className="mt-5 w-full rounded-2xl bg-lime py-4 text-base font-semibold text-ink disabled:cursor-not-allowed disabled:bg-panel disabled:text-mute">
              {unrefinedShown > 0 ? "Claim DRIP" : "Nothing to claim"}
            </button>

            <div className="mt-6">
              <h3 className="text-sm font-semibold text-white">Balances</h3>
              <div className="mt-3 space-y-3 text-sm">
                <Row label="Unrefined DRIP"><span className="flex items-center gap-1 font-semibold text-white"><Drip /> {compact(unrefinedShown)}</span></Row>
                <Row label="Refined DRIP (wallet)"><span className="flex items-center gap-1 font-semibold text-white"><Drip /> {compact(claimedShown)}</span></Row>
                <Row label="NVDA mined"><span className="flex items-center gap-1 font-semibold text-white"><Nvda /> {fmt(nvdaWonShown, 6)}</span></Row>
                <Row label="USDG claimable"><span className="flex items-center gap-1 font-semibold text-white"><Usdg /> {fmt(usdgWonShown)}</span></Row>
              </div>
            </div>

            <button
              onClick={() => { if (live) { harvestAll(); setShowRewards(false); } else { claimUsdg(); setShowRewards(false); } }}
              disabled={live ? pending.rounds.length === 0 : usdgWon <= 0}
              className="mt-4 w-full rounded-2xl bg-white py-4 text-base font-semibold text-ink disabled:cursor-not-allowed disabled:bg-panel disabled:text-mute">
              {live
                ? pending.rounds.length > 0
                  ? `Harvest ${pending.rounds.length} round${pending.rounds.length > 1 ? "s" : ""} · ${fmt(pending.totalUsdg, 2)} USDG`
                  : "Nothing to harvest"
                : usdgWon > 0 ? `Claim ${fmt(usdgWon)} USDG` : "No USDG to claim"}
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
