"use client";

import { useCallback, useEffect, useState } from "react";
import { usePublicClient } from "wagmi";
import { addresses, gridMineAbi, ponsCurveAbi } from "./contracts";
import { DRIP_MAX_SUPPLY } from "./site";
import { readCache, writeCache } from "./cache";

// Real Explore stats, read straight from the chain — no demo. Direct reads for the live figures
// (rounds, motherlode, staked, supply) plus a bounded scan of `Deployed` events for recent mining
// activity (total deployed, unique miners, a miners leaderboard) and getRound() for the recent-rounds
// table. Deeper all-time analytics (24h $ volume, holders, all-time burn, revenue tables) need a
// dedicated indexer and are intentionally not faked here.
//
// Two design rules make the data feel solid instead of "laggy / zeroing out":
//   1. BATCHED reads. The headline numbers and the whole recent-rounds table each go out as a SINGLE
//      Multicall3 call, not dozens of sequential round-trips. On a slow public RPC this is the
//      difference between ~1s and the 1-2 minutes it used to take.
//   2. STICKY, CACHED state. Initial state hydrates from the last known-good read (localStorage), so
//      returning to the page shows real numbers immediately. A failed read never overwrites a good
//      value with 0 — sections merge in field-by-field, only when they actually succeed.

const CACHE_KEY = "exploreStats";

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
// The cacheable slice of the stats (everything except the live `loading` flag and `refetch`).
export type ExploreData = {
  roundsSettled: number;
  motherlode: number; // DRIP
  totalStaked: number; // DRIP
  totalSupply: number; // DRIP
  burned: number; // DRIP burnt all-time = genesis supply − current totalSupply
  bonded: number; // DRIP held in the Pons bonding-curve reserve
  deployedWindow: number; // USDG over the scanned window
  uniqueMiners: number;
  miners: Miner[];
  activity: ActRound[];
  motherlodes: ActRound[];
};
export type ExploreStats = ExploreData & {
  loading: boolean;
  stale: boolean; // true until the first live read of THIS session lands (data shown is cached)
  refetch: () => void;
};

const EMPTY: ExploreData = {
  roundsSettled: 0, motherlode: 0, totalStaked: 0, totalSupply: 0, burned: 0, bonded: 0,
  deployedWindow: 0, uniqueMiners: 0, miners: [], activity: [], motherlodes: [],
};

export function useExploreStats(enabled: boolean): ExploreStats {
  const client = usePublicClient();
  // Hydrate from the last known-good read so a revisit/refresh shows real numbers instantly.
  const [data, setData] = useState<ExploreData>(() => readCache<ExploreData>(CACHE_KEY, EMPTY));
  const [loading, setLoading] = useState(false);
  const [stale, setStale] = useState(true);
  const [nonce, setNonce] = useState(0);
  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!enabled || !client || !addresses.gridMine) return;
    let cancelled = false;
    const gm = { address: addresses.gridMine as `0x${string}`, abi: gridMineAbi } as const;

    // Merge a partial update into state AND persist the merged result as the new known-good cache.
    const merge = (patch: Partial<ExploreData>) => {
      if (cancelled) return;
      setData((prev) => {
        const next = { ...prev, ...patch };
        writeCache(CACHE_KEY, next);
        return next;
      });
    };

    const load = async () => {
      setLoading(true);
      let cur = 0;

      // 1) Headline numbers — ONE multicall. Each output is applied only if that specific call
      //    succeeded, so a single failing read can never zero the rest.
      try {
        const calls = [
          { ...gm, functionName: "currentRound" },
          { ...gm, functionName: "motherlodeDrip" },
          ...(addresses.stake ? [{ address: addresses.stake as `0x${string}`, abi: stakeAbi, functionName: "totalStaked" }] : []),
          ...(addresses.drip ? [{ address: addresses.drip as `0x${string}`, abi: supplyAbi, functionName: "totalSupply" }] : []),
          ...(addresses.curve ? [{ address: addresses.curve as `0x${string}`, abi: ponsCurveAbi, functionName: "tokenReserve" }] : []),
        ];
        const res = await client.multicall({ contracts: calls as any, allowFailure: true });
        let i = 0;
        const roundR = res[i++];
        const mlR = res[i++];
        const stakedR = addresses.stake ? res[i++] : undefined;
        const supplyR = addresses.drip ? res[i++] : undefined;
        const bondedR = addresses.curve ? res[i++] : undefined;

        const patch: Partial<ExploreData> = {};
        if (roundR?.status === "success") { cur = Number(roundR.result as bigint); patch.roundsSettled = Math.max(0, cur - 1); }
        else { cur = data.roundsSettled + 1; } // fall back to cached rounds for the history window below
        if (mlR?.status === "success") patch.motherlode = Number(mlR.result as bigint) / 1e18;
        if (stakedR?.status === "success") patch.totalStaked = Number(stakedR.result as bigint) / 1e18;
        if (supplyR?.status === "success") {
          const supply = Number(supplyR.result as bigint) / 1e18;
          patch.totalSupply = supply;
          // DRIP burnt all-time = genesis supply − what's still in existence (70% of every cut is burned).
          patch.burned = Math.max(0, DRIP_MAX_SUPPLY - supply);
        }
        if (bondedR?.status === "success") patch.bonded = Number(bondedR.result as bigint) / 1e18;
        merge(patch);
        if (!cancelled) setStale(false); // we have a live read this session now
      } catch {
        // total RPC failure — keep whatever we already show (cached), don't blank it
        cur = data.roundsSettled + 1;
      }

      // 2) Recent-rounds table — the whole window in ONE multicall (was 20 sequential reads).
      if (cur > 1) {
        try {
          const hi = cur - 1;
          const lo = Math.max(1, hi - 19);
          const nums: number[] = [];
          for (let r = hi; r >= lo; r--) nums.push(r);
          const res = await client.multicall({
            contracts: nums.map((r) => ({ ...gm, functionName: "getRound", args: [BigInt(r)] })) as any,
            allowFailure: true,
          });
          const activity: ActRound[] = [];
          res.forEach((c, idx) => {
            if (c.status !== "success") return;
            const g = c.result as {
              status: number; winningTile: number; motherlodeHit: boolean; soloMode: boolean;
              totalIn: bigint; winnerStake: bigint; winnerPotUsdg: bigint; rewardDrip: bigint;
            };
            if (g.status !== 2) return;
            activity.push({
              round: nums[idx], winningTile: g.winningTile, hadWinner: g.winnerStake > BigInt(0),
              motherlodeHit: g.motherlodeHit, soloMode: g.soloMode,
              totalIn: Number(g.totalIn) / 1e6, winnerPotUsdg: Number(g.winnerPotUsdg) / 1e6,
              rewardDrip: Number(g.rewardDrip) / 1e18,
            });
          });
          // Only replace the table if we actually got rows — never blank a populated list on a flaky read.
          if (activity.length > 0) merge({ activity, motherlodes: activity.filter((a) => a.motherlodeHit) });
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
        // Guard against a partial/empty scan wiping a good leaderboard.
        if (miners.length > 0 || deployedTotal > BigInt(0)) {
          merge({ deployedWindow: Number(deployedTotal) / 1e6, uniqueMiners: Object.keys(agg).length, miners });
        }
      } catch { /* leave event-derived stats as-is */ }

      if (!cancelled) setLoading(false);
    };

    load();
    const id = setInterval(load, 15000);
    return () => { cancelled = true; clearInterval(id); };
    // `data` is intentionally not a dep — it's read for fallbacks only; adding it would re-run every merge.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, enabled, nonce]);

  return { ...data, loading, stale, refetch };
}
