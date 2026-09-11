"use client";

import { useReadContract, useReadContracts } from "wagmi";
import { addresses, gridMineAbi } from "./contracts";
import { gridMine as params } from "./site";

// Reads the live on-chain round state from GridMine so the Mine screen can show REAL data
// (deployed pool, per-tile amounts, time left, motherlode) when a wallet is connected on testnet.
// Falls back to the demo when not `enabled` or while data is loading.
export function useLiveRound(enabled: boolean) {
  const gm = { address: (addresses.gridMine || undefined) as `0x${string}` | undefined, abi: gridMineAbi } as const;

  const round = useReadContract({ ...gm, functionName: "currentRound", query: { enabled, refetchInterval: 4000 } });
  const rid = round.data as bigint | undefined;

  const motherlode = useReadContract({ ...gm, functionName: "motherlodeDrip", query: { enabled, refetchInterval: 8000 } });
  const timeLeft = useReadContract({ ...gm, functionName: "timeLeft", query: { enabled, refetchInterval: 2000 } });

  const tiles = useReadContracts({
    contracts:
      rid !== undefined
        ? Array.from({ length: params.tiles }, (_, i) => ({ ...gm, functionName: "tileTotal" as const, args: [rid, i] as const }))
        : [],
    query: { enabled: enabled && rid !== undefined, refetchInterval: 4000 },
  });

  const tileAmts = (tiles.data ?? []).map((r) => (r.status === "success" ? Number(r.result as bigint) / 1e6 : 0));
  const pool = tileAmts.reduce((s, v) => s + v, 0);

  return {
    ready: enabled && rid !== undefined && Array.isArray(tiles.data) && tiles.data.length === params.tiles,
    round: rid !== undefined ? Number(rid) : 0,
    pool,
    tiles: tileAmts,
    timeLeft: timeLeft.data !== undefined ? Number(timeLeft.data as bigint) : 0,
    motherlode: motherlode.data !== undefined ? Number(motherlode.data as bigint) / 1e18 : 0,
    refetch: () => { round.refetch(); tiles.refetch(); timeLeft.refetch(); motherlode.refetch(); },
  };
}
