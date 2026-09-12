"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccount, usePublicClient } from "wagmi";
import { addresses, gridMineAbi } from "./contracts";
import { readCache, writeCache } from "./cache";

// The connected wallet's UNCLAIMED (pre-harvest) winnings, across every settled round it played.
// Reads GridMine directly (getRound + stakeOf + the usdg/drip/nvda claim flags) and applies the SAME
// payout math the contract's harvest() uses, so a player can SEE what each round owes them — USDG,
// DRIP and NVDA — before harvesting, and harvest each round individually (not just the latest one).
//
// Fast + sticky: candidate rounds come from the wallet's own `Deployed` events scanned in PARALLEL
// chunks, and every per-round read is collapsed into Multicall3 batches (not awaited one at a time),
// so the "harvest to claim" list appears in ~1s instead of many seconds. Hydrated from a per-wallet
// cache and never blanked on an RPC hiccup — the last known list stays on screen.

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

export type PendingRound = { round: number; usdg: number; drip: number; nvda: number };
export type PendingData = { rounds: PendingRound[]; totalUsdg: number; totalDrip: number; totalNvda: number };
export type Pending = PendingData & { loading: boolean; refetch: () => void };

const EMPTY: PendingData = { rounds: [], totalUsdg: 0, totalDrip: 0, totalNvda: 0 };
const STATUS_SETTLED = 2; // enum Status { Open, Closed, Settled }
const keyFor = (a?: string) => `pendingWinnings.${(a || "anon").toLowerCase()}`;

type Round = {
  status: number; winningTile: number; rewardsProcessed: boolean; soloMode: boolean; soloWinner: string;
  winnerStake: bigint; winnerPotUsdg: bigint; rewardDrip: bigint; rewardNvda: bigint;
};

export function usePendingWinnings(enabled: boolean): Pending {
  const { address } = useAccount();
  const client = usePublicClient();
  const [data, setData] = useState<PendingData>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [nonce, setNonce] = useState(0);
  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  // Instant hydrate from the last known-good list for this wallet.
  useEffect(() => { setData(readCache<PendingData>(keyFor(address), EMPTY)); }, [address]);

  useEffect(() => {
    if (!enabled || !client || !address || !addresses.gridMine) return;
    let cancelled = false;
    const gm = { address: addresses.gridMine as `0x${string}`, abi: gridMineAbi } as const;
    const me = address.toLowerCase();

    const load = async () => {
      try {
        setLoading(true);
        // 1) Which rounds did this wallet deploy in? Scan a wide span in PARALLEL chunks.
        const latest = await client.getBlockNumber();
        const MAX_SPAN = BigInt(3_000_000); // ~3.5 days at 0.1s/block
        const CHUNK = BigInt(450_000);
        const start = latest > MAX_SPAN ? latest - MAX_SPAN : BigInt(0);
        const ranges: { fromBlock: bigint; toBlock: bigint }[] = [];
        for (let lo = start; lo <= latest; lo = lo + CHUNK + BigInt(1)) {
          ranges.push({ fromBlock: lo, toBlock: lo + CHUNK < latest ? lo + CHUNK : latest });
        }
        const logChunks = await Promise.all(
          ranges.map((rg) => client.getLogs({ address: gm.address, event: deployedEvent, args: { player: address }, ...rg }).catch(() => []))
        );
        const roundSet = new Set<number>();
        for (const logs of logChunks) for (const l of logs) {
          const r = (l.args as { round?: bigint }).round;
          if (r !== undefined) roundSet.add(Number(r));
        }
        const candidates = Array.from(roundSet).sort((a, b) => a - b);
        if (candidates.length === 0) { if (!cancelled) { setData(EMPTY); writeCache(keyFor(address), EMPTY); } return; }

        // 2) getRound for every candidate — ONE multicall.
        const roundsRes = await client.multicall({
          contracts: candidates.map((r) => ({ ...gm, functionName: "getRound", args: [BigInt(r)] })) as any,
          allowFailure: true,
        });
        const won: { round: number; r: Round }[] = [];
        roundsRes.forEach((c, i) => {
          if (c.status !== "success") return;
          const r = c.result as Round;
          if (r.status === STATUS_SETTLED && r.winnerStake > BigInt(0)) won.push({ round: candidates[i], r });
        });
        if (won.length === 0) { if (!cancelled) { setData(EMPTY); writeCache(keyFor(address), EMPTY); } return; }

        // 3) Your stake on each winning tile — ONE multicall.
        const stakeRes = await client.multicall({
          contracts: won.map(({ round, r }) => ({ ...gm, functionName: "stakeOf", args: [BigInt(round), r.winningTile, address] })) as any,
          allowFailure: true,
        });
        const winners = won.filter((_, i) => stakeRes[i]?.status === "success" && (stakeRes[i].result as bigint) > BigInt(0))
          .map((w, _i) => w);
        // Re-pair stakes with the filtered winners.
        const stakes = new Map<number, bigint>();
        won.forEach(({ round }, i) => { if (stakeRes[i]?.status === "success") stakes.set(round, stakeRes[i].result as bigint); });
        const eligible = winners.filter((w) => (stakes.get(w.round) ?? BigInt(0)) > BigInt(0));
        if (eligible.length === 0) { if (!cancelled) { setData(EMPTY); writeCache(keyFor(address), EMPTY); } return; }

        // 4) Claim flags (usdg/drip/nvda) for each eligible round — ONE multicall (3 per round).
        const flagContracts = eligible.flatMap(({ round }) => [
          { ...gm, functionName: "usdgClaimed", args: [BigInt(round), address] },
          { ...gm, functionName: "dripClaimed", args: [BigInt(round), address] },
          { ...gm, functionName: "nvdaClaimed", args: [BigInt(round), address] },
        ]);
        const flagsRes = await client.multicall({ contracts: flagContracts as any, allowFailure: true });

        const rounds: PendingRound[] = [];
        eligible.forEach(({ round, r }, i) => {
          const s = stakes.get(round) as bigint;
          const usdgC = flagsRes[i * 3]?.status === "success" ? (flagsRes[i * 3].result as boolean) : true;
          const dripC = flagsRes[i * 3 + 1]?.status === "success" ? (flagsRes[i * 3 + 1].result as boolean) : true;
          const nvdaC = flagsRes[i * 3 + 2]?.status === "success" ? (flagsRes[i * 3 + 2].result as boolean) : true;
          const soloYou = r.soloMode && r.soloWinner.toLowerCase() === me;
          let usdg = 0, drip = 0, nvda = 0;
          if (!usdgC) usdg = Number(s + (r.winnerPotUsdg * s) / r.winnerStake) / 1e6;
          if (r.rewardsProcessed && !dripC) {
            const out = r.soloMode ? (soloYou ? r.rewardDrip : BigInt(0)) : (r.rewardDrip * s) / r.winnerStake;
            drip = Number(out) / 1e18;
          }
          if (r.rewardsProcessed && !nvdaC) {
            const out = r.soloMode ? (soloYou ? r.rewardNvda : BigInt(0)) : (r.rewardNvda * s) / r.winnerStake;
            nvda = Number(out) / 1e18;
          }
          if (usdg > 0 || drip > 0 || nvda > 0) rounds.push({ round, usdg, drip, nvda });
        });

        if (cancelled) return;
        const next: PendingData = {
          rounds,
          totalUsdg: rounds.reduce((a, r) => a + r.usdg, 0),
          totalDrip: rounds.reduce((a, r) => a + r.drip, 0),
          totalNvda: rounds.reduce((a, r) => a + r.nvda, 0),
        };
        setData(next);
        writeCache(keyFor(address), next);
      } catch {
        // Keep the last known-good list on an RPC hiccup — never blank what's already shown.
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    const id = setInterval(load, 8000);
    return () => { cancelled = true; clearInterval(id); };
  }, [client, address, enabled, nonce]);

  return { ...data, loading, refetch };
}
