"use client";

import { useEffect, useState } from "react";
import { useAccount, usePublicClient } from "wagmi";
import { addresses } from "./contracts";
import { readCache, writeCache } from "./cache";

// How much DRIP the connected wallet has actually REFINED from mining — i.e. claimed out of the
// RefiningVault — as opposed to its raw DRIP balance (which also includes DRIP bought on Trade or held
// from anywhere else). The vault keeps no cumulative "claimed" total on-chain, so we derive it from
// the vault's `Claimed(account, net, fee)` events, filtered to this wallet (account is indexed, so the
// RPC returns only this user's claims — cheap). Cached per-wallet for an instant, non-blank read.

const claimedEvent = {
  type: "event",
  name: "Claimed",
  inputs: [
    { name: "account", type: "address", indexed: true },
    { name: "net", type: "uint256", indexed: false },
    { name: "fee", type: "uint256", indexed: false },
  ],
} as const;

const keyFor = (a?: string) => `refinedDrip.${(a || "anon").toLowerCase()}`;

export function useRefinedDrip(enabled: boolean): { refined: number } {
  const client = usePublicClient();
  const { address } = useAccount();
  const [refined, setRefined] = useState<number>(0);

  // Instant hydrate from cache whenever the wallet changes.
  useEffect(() => { setRefined(readCache<number>(keyFor(address), 0)); }, [address]);

  useEffect(() => {
    if (!enabled || !client || !address || !addresses.refining) return;
    let cancelled = false;

    const load = async () => {
      try {
        const latest = await client.getBlockNumber();
        // Generous window — the game is young, so this covers its whole life; only a few chunked calls,
        // each returning just this wallet's claims thanks to the indexed-account filter.
        const MAX_SPAN = BigInt(5_000_000);
        const CHUNK = BigInt(500_000);
        let blk = latest > MAX_SPAN ? latest - MAX_SPAN : BigInt(0);
        let sum = BigInt(0);
        while (blk <= latest) {
          const end = blk + CHUNK < latest ? blk + CHUNK : latest;
          const logs = await client.getLogs({
            address: addresses.refining as `0x${string}`,
            event: claimedEvent,
            args: { account: address },
            fromBlock: blk, toBlock: end,
          });
          for (const l of logs) { const a = l.args as { net?: bigint }; if (a.net) sum += a.net; }
          blk = end + BigInt(1);
        }
        if (!cancelled) {
          const v = Number(sum) / 1e18;
          setRefined(v);
          writeCache(keyFor(address), v);
        }
      } catch { /* keep the cached value on a flaky scan */ }
    };

    load();
    const id = setInterval(load, 20000);
    return () => { cancelled = true; clearInterval(id); };
  }, [client, enabled, address]);

  return { refined };
}
