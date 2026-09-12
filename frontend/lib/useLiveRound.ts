"use client";

import { useEffect } from "react";
import { useAccount, useReadContract, useReadContracts } from "wagmi";
import { addresses, gridMineAbi } from "./contracts";
import { gridMine as params } from "./site";
import { readCache, writeCache } from "./cache";

// Reads the live on-chain round state from GridMine so the Mine screen can show REAL data:
// the deployed pool, each tile's total, the connected wallet's OWN stake per tile, time left, and
// the motherlode. Falls back to the demo when not `enabled` or while data is loading.
//
// To stop the "everything flashes 0 for a second (or much longer on a slow RPC) whenever I come back"
// problem, the last known-good snapshot is cached per-wallet and used as a fallback until the live
// reads land. The reads themselves are already collapsed into a single Multicall3 request by wagmi.

type Snapshot = {
  round: number; pool: number; tiles: number[]; mine: number[]; timeLeft: number; motherlode: number;
};
const keyFor = (address?: string) => `liveRound.${(address || "anon").toLowerCase()}`;

export function useLiveRound(enabled: boolean) {
  const { address } = useAccount();
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

  // The connected wallet's own stake on each tile this round (stakeOf[round][tile][you]).
  const mineReads = useReadContracts({
    contracts:
      rid !== undefined && address
        ? Array.from({ length: params.tiles }, (_, i) => ({ ...gm, functionName: "stakeOf" as const, args: [rid, i, address] as const }))
        : [],
    query: { enabled: enabled && rid !== undefined && !!address, refetchInterval: 4000 },
  });

  // Last known-good snapshot for this wallet, used only as a fallback so nothing flashes to 0.
  const cached = enabled ? readCache<Snapshot | null>(keyFor(address), null) : null;

  const tilesLoaded = Array.isArray(tiles.data) && tiles.data.length === params.tiles;
  const liveTileAmts = tilesLoaded ? (tiles.data ?? []).map((r) => (r.status === "success" ? Number(r.result as bigint) / 1e6 : 0)) : undefined;
  const liveMineAmts = Array.from({ length: params.tiles }, (_, i) => {
    const r = mineReads.data?.[i];
    return r && r.status === "success" ? Number(r.result as bigint) / 1e6 : 0;
  });

  // Prefer live values; fall back to the cached snapshot only while the live read is still pending.
  const roundNum = rid !== undefined ? Number(rid) : cached?.round ?? 0;
  const tileAmts = liveTileAmts ?? cached?.tiles ?? [];
  // `mine` only falls back to cache when this is the SAME round the snapshot was taken on (otherwise a
  // stale stake could look current). A fresh round with no reads yet just shows 0, never wrong numbers.
  const mineAmts =
    mineReads.data && address ? liveMineAmts : cached && cached.round === roundNum ? cached.mine : Array.from({ length: params.tiles }, () => 0);
  const pool = liveTileAmts ? liveTileAmts.reduce((s, v) => s + v, 0) : cached?.round === roundNum ? cached?.pool ?? 0 : 0;
  const timeLeftNum = timeLeft.data !== undefined ? Number(timeLeft.data as bigint) : cached?.round === roundNum ? cached?.timeLeft ?? 0 : 0;
  const motherlodeNum = motherlode.data !== undefined ? Number(motherlode.data as bigint) / 1e18 : cached?.motherlode ?? 0;

  const ready = enabled && rid !== undefined && tilesLoaded;

  // Persist the snapshot once the live reads for this round have actually landed.
  useEffect(() => {
    if (!enabled || !ready || liveTileAmts === undefined) return;
    const snap: Snapshot = {
      round: roundNum, pool: liveTileAmts.reduce((s, v) => s + v, 0), tiles: liveTileAmts,
      mine: mineReads.data && address ? liveMineAmts : Array.from({ length: params.tiles }, () => 0),
      timeLeft: timeLeftNum, motherlode: motherlodeNum,
    };
    writeCache(keyFor(address), snap);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ready, roundNum, address, JSON.stringify(liveTileAmts), JSON.stringify(liveMineAmts), timeLeftNum, motherlodeNum]);

  return {
    ready,
    round: roundNum,
    pool,
    tiles: tileAmts,
    mine: mineAmts, // your own stake per tile
    timeLeft: timeLeftNum,
    motherlode: motherlodeNum,
    refetch: () => { round.refetch(); tiles.refetch(); mineReads.refetch(); timeLeft.refetch(); motherlode.refetch(); },
  };
}
