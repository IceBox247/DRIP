"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccount, usePublicClient } from "wagmi";
import { addresses, gridMineAbi } from "./contracts";

// The connected wallet's UNCLAIMED (pre-harvest) winnings, across every settled round it played.
// Reads GridMine directly (getRound + stakeOf + the usdg/drip/nvda claim flags) and applies the SAME
// payout math the contract's harvest() uses, so a player can SEE what each round owes them — USDG,
// DRIP and NVDA — before harvesting, and harvest each round individually (not just the latest one).
//
// A player can only win a round it deployed in, so we discover candidate rounds from the wallet's own
// `Deployed` events (bounded lookback) rather than scanning the whole history.

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
export type Pending = {
  rounds: PendingRound[];
  totalUsdg: number;
  totalDrip: number;
  totalNvda: number;
  loading: boolean;
  refetch: () => void;
};

const EMPTY: Omit<Pending, "refetch"> = { rounds: [], totalUsdg: 0, totalDrip: 0, totalNvda: 0, loading: false };
const STATUS_SETTLED = 2; // enum Status { Open, Closed, Settled }

export function usePendingWinnings(enabled: boolean): Pending {
  const { address } = useAccount();
  const client = usePublicClient();
  const [state, setState] = useState<Omit<Pending, "refetch">>(EMPTY);
  const [nonce, setNonce] = useState(0);
  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!enabled || !client || !address || !addresses.gridMine) {
      setState(EMPTY);
      return;
    }
    let cancelled = false;
    const gm = { address: addresses.gridMine as `0x${string}`, abi: gridMineAbi } as const;
    const me = address.toLowerCase();

    const load = async () => {
      try {
        setState((s) => ({ ...s, loading: true }));
        // Which rounds has this wallet deployed in? (bounded lookback, like the miners list)
        const latest = await client.getBlockNumber();
        const span = BigInt(50000);
        const from = latest > span ? latest - span : BigInt(0);
        const logs = await client.getLogs({
          address: gm.address,
          event: deployedEvent,
          args: { player: address },
          fromBlock: from,
          toBlock: latest,
        });
        const roundSet = new Set<number>();
        for (const l of logs) {
          const r = (l.args as { round?: bigint }).round;
          if (r !== undefined) roundSet.add(Number(r));
        }
        const candidates = Array.from(roundSet).sort((a, b) => a - b);

        const rounds: PendingRound[] = [];
        for (const round of candidates) {
          const r = (await client.readContract({ ...gm, functionName: "getRound", args: [BigInt(round)] })) as {
            status: number; winningTile: number; rewardsProcessed: boolean; soloMode: boolean; soloWinner: string;
            winnerStake: bigint; winnerPotUsdg: bigint; rewardDrip: bigint; rewardNvda: bigint;
          };
          if (r.status !== STATUS_SETTLED || r.winnerStake === BigInt(0)) continue; // not settled / no winners
          const s = (await client.readContract({
            ...gm, functionName: "stakeOf", args: [BigInt(round), r.winningTile, address],
          })) as bigint;
          if (s === BigInt(0)) continue; // wallet had no stake on the winning tile
          const [usdgC, dripC, nvdaC] = (await Promise.all([
            client.readContract({ ...gm, functionName: "usdgClaimed", args: [BigInt(round), address] }),
            client.readContract({ ...gm, functionName: "dripClaimed", args: [BigInt(round), address] }),
            client.readContract({ ...gm, functionName: "nvdaClaimed", args: [BigInt(round), address] }),
          ])) as [boolean, boolean, boolean];

          const soloYou = r.soloMode && r.soloWinner.toLowerCase() === me;
          let usdg = 0, drip = 0, nvda = 0;
          // USDG pot is always pro-rata (principal back + share of the winner pot).
          if (!usdgC) usdg = Number(s + (r.winnerPotUsdg * s) / r.winnerStake) / 1e6;
          // DRIP + NVDA follow the 1-or-all flip (solo winner takes all, else pro-rata).
          if (r.rewardsProcessed && !dripC) {
            const out = r.soloMode ? (soloYou ? r.rewardDrip : BigInt(0)) : (r.rewardDrip * s) / r.winnerStake;
            drip = Number(out) / 1e18;
          }
          if (r.rewardsProcessed && !nvdaC) {
            const out = r.soloMode ? (soloYou ? r.rewardNvda : BigInt(0)) : (r.rewardNvda * s) / r.winnerStake;
            nvda = Number(out) / 1e18;
          }
          if (usdg > 0 || drip > 0 || nvda > 0) rounds.push({ round, usdg, drip, nvda });
        }
        if (cancelled) return;
        setState({
          rounds,
          totalUsdg: rounds.reduce((a, r) => a + r.usdg, 0),
          totalDrip: rounds.reduce((a, r) => a + r.drip, 0),
          totalNvda: rounds.reduce((a, r) => a + r.nvda, 0),
          loading: false,
        });
      } catch {
        if (!cancelled) setState(EMPTY); // on any RPC hiccup, show nothing rather than stale/fake data
      }
    };

    load();
    const id = setInterval(load, 8000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [client, address, enabled, nonce]);

  return { ...state, refetch };
}
