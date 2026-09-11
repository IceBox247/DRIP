"use client";

import { useEffect, useState } from "react";
import { usePublicClient } from "wagmi";
import { addresses } from "./contracts";

// Reads the REAL miners in a round from GridMine's `Deployed` events and aggregates them per player
// (how many tiles they're on + total USDG deployed). Replaces the demo miners list on the Mine screen
// with actual on-chain activity. Empty until someone deploys in the round.

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

export type Miner = { addr: string; tiles: number; total: number };

export function useLiveMiners(round: number, enabled: boolean): Miner[] {
  const client = usePublicClient();
  const [miners, setMiners] = useState<Miner[]>([]);

  useEffect(() => {
    if (!enabled || !client || !addresses.gridMine || !round) {
      setMiners([]);
      return;
    }
    let cancelled = false;

    const load = async () => {
      try {
        const latest = await client.getBlockNumber();
        // A 60s round spans only a small window; a bounded lookback keeps the RPC happy while still
        // covering the round's whole life.
        const span = BigInt(20000);
        const from = latest > span ? latest - span : BigInt(0);
        const logs = await client.getLogs({
          address: addresses.gridMine as `0x${string}`,
          event: deployedEvent,
          args: { round: BigInt(round) },
          fromBlock: from,
          toBlock: latest,
        });

        const agg: Record<string, { tiles: Set<number>; total: bigint }> = {};
        for (const l of logs) {
          const a = l.args as { player?: string; tile?: number; amount?: bigint };
          if (!a.player || a.amount === undefined) continue;
          const p = a.player.toLowerCase();
          if (!agg[p]) agg[p] = { tiles: new Set(), total: BigInt(0) };
          agg[p].tiles.add(Number(a.tile));
          agg[p].total += a.amount;
        }
        const list = Object.entries(agg)
          .map(([addr, v]) => ({ addr, tiles: v.tiles.size, total: Number(v.total) / 1e6 }))
          .sort((a, b) => b.total - a.total);
        if (!cancelled) setMiners(list);
      } catch {
        if (!cancelled) setMiners([]); // on any RPC hiccup, show empty rather than stale/fake data
      }
    };

    load();
    const id = setInterval(load, 6000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [client, round, enabled]);

  return miners;
}
