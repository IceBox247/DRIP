"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccount, usePublicClient } from "wagmi";
import { addresses, gridMineAbi } from "./contracts";

// Recent settled rounds for the history view: winning tile, pot, the round's DRIP/NVDA rewards,
// motherlode/solo flags, and whether the connected wallet was on the winning tile. Read straight from
// GridMine (getRound + stakeOf) so the history is real on-chain results, not a demo.

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

export function useRoundHistory(enabled: boolean, currentRound: number, count = 15) {
  const { address } = useAccount();
  const client = usePublicClient();
  const [rows, setRows] = useState<RoundInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [nonce, setNonce] = useState(0);
  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!enabled || !client || !addresses.gridMine || currentRound <= 1) {
      setRows([]);
      return;
    }
    let cancelled = false;
    const gm = { address: addresses.gridMine as `0x${string}`, abi: gridMineAbi } as const;

    const load = async () => {
      try {
        setLoading(true);
        const hi = currentRound - 1;
        const lo = Math.max(1, hi - count + 1);
        const nums: number[] = [];
        for (let r = hi; r >= lo; r--) nums.push(r);
        const settled = await Promise.allSettled(
          nums.map(async (r) => {
            const g = (await client.readContract({ ...gm, functionName: "getRound", args: [BigInt(r)] })) as {
              status: number; winningTile: number; motherlodeHit: boolean; rewardsProcessed: boolean;
              soloMode: boolean; soloWinner: string; totalIn: bigint; winnerStake: bigint;
              winnerPotUsdg: bigint; rewardDrip: bigint; rewardNvda: bigint;
            };
            const hadWinner = g.winnerStake > BigInt(0);
            let youWon = false;
            if (address && g.status === 2 && hadWinner) {
              const s = (await client.readContract({
                ...gm, functionName: "stakeOf", args: [BigInt(r), g.winningTile, address],
              })) as bigint;
              youWon = s > BigInt(0);
            }
            return {
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
              hadWinner,
              youWon,
            };
          })
        );
        // Keep the rounds that read successfully — a few flaky reads shouldn't blank the whole list.
        const infos = settled.flatMap((s) => (s.status === "fulfilled" ? [s.value] : []));
        if (!cancelled && infos.length > 0) setRows(infos.filter((i) => i.status === 2));
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
