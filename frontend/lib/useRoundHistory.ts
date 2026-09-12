"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccount, usePublicClient } from "wagmi";
import { addresses, gridMineAbi } from "./contracts";
import { readCache, writeCache } from "./cache";

// Recent settled rounds for the history view: winning tile, pot, the round's DRIP/NVDA rewards,
// motherlode/solo flags, and whether the connected wallet was on the winning tile. Read straight from
// GridMine (getRound + stakeOf) so the history is real on-chain results, not a demo.
//
// Batched into 2 multicalls (all getRound()s, then the stakeOf checks for rounds that had a winner)
// instead of up to ~30 sequential reads, and cached per-wallet so re-opening the history shows the
// last real list instantly instead of flashing "No settled rounds yet".

export type RoundInfo = {
  round: number;
  status: number;
  winningTile: number;
  totalIn: number; // net pool (USDG)
  winnerPotUsdg: number;
  rewardDrip: number;
  rewardNvda: number;
  motherlodeHit: boolean;
  soloMode: boolean;
  soloWinner: string;
  rewardsProcessed: boolean;
  hadWinner: boolean; // someone was on the winning tile
  youWon: boolean; // the connected wallet was on the winning tile
};

const keyFor = (address?: string) => `roundHistory.${(address || "anon").toLowerCase()}`;

export function useRoundHistory(enabled: boolean, currentRound: number, count = 15) {
  const { address } = useAccount();
  const client = usePublicClient();
  const [rows, setRows] = useState<RoundInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [nonce, setNonce] = useState(0);
  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  // Instant hydrate from the last known-good list for THIS wallet whenever the wallet changes.
  useEffect(() => {
    setRows(readCache<RoundInfo[]>(keyFor(address), []));
  }, [address]);

  useEffect(() => {
    if (!enabled || !client || !addresses.gridMine || currentRound <= 1) return;
    let cancelled = false;
    const gm = { address: addresses.gridMine as `0x${string}`, abi: gridMineAbi } as const;

    const load = async () => {
      try {
        setLoading(true);
        const hi = currentRound - 1;
        const lo = Math.max(1, hi - count + 1);
        const nums: number[] = [];
        for (let r = hi; r >= lo; r--) nums.push(r);

        // 1) All rounds in one multicall.
        const roundsRes = await client.multicall({
          contracts: nums.map((r) => ({ ...gm, functionName: "getRound", args: [BigInt(r)] })) as any,
          allowFailure: true,
        });

        type G = {
          status: number; winningTile: number; motherlodeHit: boolean; rewardsProcessed: boolean;
          soloMode: boolean; soloWinner: string; totalIn: bigint; winnerStake: bigint;
          winnerPotUsdg: bigint; rewardDrip: bigint; rewardNvda: bigint;
        };
        const got: { r: number; g: G }[] = [];
        roundsRes.forEach((c, idx) => {
          if (c.status === "success") got.push({ r: nums[idx], g: c.result as G });
        });

        // 2) For settled rounds that had a winner, check the wallet's stake on the winning tile — one multicall.
        const contested = got.filter(({ g }) => g.status === 2 && g.winnerStake > BigInt(0));
        let youWonByRound: Record<number, boolean> = {};
        if (address && contested.length > 0) {
          const stakeRes = await client.multicall({
            contracts: contested.map(({ r, g }) => ({ ...gm, functionName: "stakeOf", args: [BigInt(r), g.winningTile, address] })) as any,
            allowFailure: true,
          });
          contested.forEach(({ r }, idx) => {
            const s = stakeRes[idx];
            youWonByRound[r] = s?.status === "success" && (s.result as bigint) > BigInt(0);
          });
        }

        const infos: RoundInfo[] = got
          .filter(({ g }) => g.status === 2)
          .map(({ r, g }) => ({
            round: r,
            status: g.status,
            winningTile: g.winningTile,
            totalIn: Number(g.totalIn) / 1e6,
            winnerPotUsdg: Number(g.winnerPotUsdg) / 1e6,
            rewardDrip: Number(g.rewardDrip) / 1e18,
            rewardNvda: Number(g.rewardNvda) / 1e18,
            motherlodeHit: g.motherlodeHit,
            soloMode: g.soloMode,
            soloWinner: g.soloWinner,
            rewardsProcessed: g.rewardsProcessed,
            hadWinner: g.winnerStake > BigInt(0),
            youWon: !!youWonByRound[r],
          }));

        // Keep a populated list — a few flaky reads shouldn't blank what's already shown.
        if (!cancelled && infos.length > 0) {
          setRows(infos);
          writeCache(keyFor(address), infos);
        }
      } catch {
        // leave existing rows in place on total failure (don't blank what's already shown)
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    const id = setInterval(load, 10000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [client, address, enabled, currentRound, count, nonce]);

  return { rows, loading, refetch };
}
