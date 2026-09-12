"use client";

import { useCallback, useEffect, useState } from "react";
import { usePublicClient } from "wagmi";
import { addresses, gridMineAbi, erc20Abi } from "./contracts";

// Real Explore stats, read straight from the chain — no demo. Direct reads for the live figures
// (rounds, motherlode, staked, supply) plus a bounded scan of `Deployed` events for recent mining
// activity (total deployed, unique miners, a miners leaderboard) and getRound() for the recent-rounds
// table. Deeper all-time analytics (24h $ volume, holders, all-time burn, revenue tables) need a
// dedicated indexer and are intentionally not faked here.

const deployedEvent = {
  type: "event",
  name: "Deployed",
  inputs: [
    { name: "round", type: "uint256", indexed: true },
    { name: "player", type: "address", indexed: true },
    { name: "tile", type: "uint8", indexed: false },
    { name: "amount", type: "uint256", indexed: false },
  ],
} as const;

const stakeAbi = [
  { type: "function", name: "totalStaked", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
] as const;
const supplyAbi = [
  { type: "function", name: "totalSupply", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
] as const;

export type Miner = { addr: string; total: number; tiles: number };
export type ActRound = {
  round: number; winningTile: number; hadWinner: boolean; motherlodeHit: boolean; soloMode: boolean;
  totalIn: number; winnerPotUsdg: number; rewardDrip: number;
};
export type ExploreStats = {
  loading: boolean;
  roundsSettled: number;
  motherlode: number; // DRIP
  totalStaked: number; // DRIP
  totalSupply: number; // DRIP
  deployedWindow: number; // USDG over the scanned window
  uniqueMiners: number;
  miners: Miner[];
  activity: ActRound[];
  motherlodes: ActRound[];
  refetch: () => void;
};

const EMPTY: Omit<ExploreStats, "refetch"> = {
  loading: false, roundsSettled: 0, motherlode: 0, totalStaked: 0, totalSupply: 0,
  deployedWindow: 0, uniqueMiners: 0, miners: [], activity: [], motherlodes: [],
};

export function useExploreStats(enabled: boolean): ExploreStats {
  const client = usePublicClient();
  const [state, setState] = useState<Omit<ExploreStats, "refetch">>(EMPTY);
  const [nonce, setNonce] = useState(0);
  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!enabled || !client || !addresses.gridMine) { setState(EMPTY); return; }
    let cancelled = false;
    const gm = { address: addresses.gridMine as `0x${string}`, abi: gridMineAbi } as const;

    // Three INDEPENDENT sections. A failure in one (e.g. a flaky getLogs) must never zero the others,
    // so each has its own try/catch and merges into state via a functional update.
    const load = async () => {
      setState((s) => ({ ...s, loading: true }));
      let cur = 0;

      // 1) Direct live reads — the headline numbers. These are cheap and should almost always succeed.
      try {
        const currentRound = (await client.readContract({ ...gm, functionName: "currentRound" })) as bigint;
        cur = Number(currentRound);
        const motherlode = (await client.readContract({ ...gm, functionName: "motherlodeDrip" })) as bigint;
        let totalStaked = BigInt(0), totalSupply = BigInt(0);
        try { if (addresses.stake) totalStaked = (await client.readContract({ address: addresses.stake as `0x${string}`, abi: stakeAbi, functionName: "totalStaked" })) as bigint; } catch { /* keep 0 */ }
        try { if (addresses.drip) totalSupply = (await client.readContract({ address: addresses.drip as `0x${string}`, abi: supplyAbi, functionName: "totalSupply" })) as bigint; } catch { /* keep 0 */ }
        if (!cancelled) setState((s) => ({
          ...s, loading: false,
          roundsSettled: Math.max(0, cur - 1),
          motherlode: Number(motherlode) / 1e18,
          totalStaked: Number(totalStaked) / 1e18,
          totalSupply: Number(totalSupply) / 1e18,
        }));
      } catch { if (!cancelled) setState((s) => ({ ...s, loading: false })); }

      // 2) Recent-rounds table (real settled rounds) — independent of the events scan.
      if (cur > 1) {
        try {
          const hi = cur - 1;
          const lo = Math.max(1, hi - 19);
          const activity: ActRound[] = [];
          for (let r = hi; r >= lo; r--) {
            const g = (await client.readContract({ ...gm, functionName: "getRound", args: [BigInt(r)] })) as {
              status: number; winningTile: number; motherlodeHit: boolean; soloMode: boolean;
              totalIn: bigint; winnerStake: bigint; winnerPotUsdg: bigint; rewardDrip: bigint;
            };
            if (g.status !== 2) continue;
            activity.push({
              round: r, winningTile: g.winningTile, hadWinner: g.winnerStake > BigInt(0),
              motherlodeHit: g.motherlodeHit, soloMode: g.soloMode,
              totalIn: Number(g.totalIn) / 1e6, winnerPotUsdg: Number(g.winnerPotUsdg) / 1e6,
              rewardDrip: Number(g.rewardDrip) / 1e18,
            });
          }
          if (!cancelled) setState((s) => ({ ...s, activity, motherlodes: activity.filter((a) => a.motherlodeHit) }));
        } catch { /* leave activity as-is */ }
      }

      // 3) Deployed events over a bounded window, chunked. If the RPC balks, we just skip these
      //    event-derived stats — the headline numbers above still stand.
      try {
        const latest = await client.getBlockNumber();
        const MAX_SPAN = BigInt(1_500_000); // ~42h at 0.1s/block — plenty, and only a few getLogs calls
        const CHUNK = BigInt(500_000);
        const start = latest > MAX_SPAN ? latest - MAX_SPAN : BigInt(0);
        const agg: Record<string, { total: bigint; tiles: Set<number> }> = {};
        let deployedTotal = BigInt(0);
        let blk = start;
        while (blk <= latest) {
          const end = blk + CHUNK < latest ? blk + CHUNK : latest;
          const logs = await client.getLogs({ address: gm.address, event: deployedEvent, fromBlock: blk, toBlock: end });
          for (const l of logs) {
            const a = l.args as { player?: string; tile?: number; amount?: bigint };
            if (!a.player || a.amount === undefined) continue;
            const p = a.player.toLowerCase();
            if (!agg[p]) agg[p] = { total: BigInt(0), tiles: new Set() };
            agg[p].total += a.amount;
            agg[p].tiles.add(Number(a.tile));
            deployedTotal += a.amount;
          }
          blk = end + BigInt(1);
        }
        const miners = Object.entries(agg)
          .map(([addr, v]) => ({ addr, total: Number(v.total) / 1e6, tiles: v.tiles.size }))
          .sort((a, b) => b.total - a.total)
          .slice(0, 10);
        if (!cancelled) setState((s) => ({ ...s, deployedWindow: Number(deployedTotal) / 1e6, uniqueMiners: Object.keys(agg).length, miners }));
      } catch { /* leave event-derived stats as-is */ }
    };

    load();
    const id = setInterval(load, 15000);
    return () => { cancelled = true; clearInterval(id); };
  }, [client, enabled, nonce]);

  return { ...state, refetch };
}
