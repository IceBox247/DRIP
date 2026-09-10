"use client";

import { useState } from "react";
import { useAccount, useReadContract } from "wagmi";
import { formatUnits } from "viem";
import { addresses, contractsReady } from "@/lib/contracts";

// Faucet + live balances. Renders only when the game contracts are configured AND a wallet is
// connected. The faucet is GASLESS: it POSTs to /api/faucet, where the keeper wallet pays the gas,
// mints test USDG to the user, and drips a little testnet ETH so a zero-balance user can then play.

const balAbi = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
] as const;

const fmt = (v: bigint | undefined, dec: number, show = 2) =>
  v === undefined ? "—" : Number(formatUnits(v, dec)).toLocaleString("en-US", { maximumFractionDigits: show });

export function Faucet() {
  const { address, isConnected } = useAccount();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const usdg = useReadContract({
    address: addresses.usdg || undefined, abi: balAbi, functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!addresses.usdg, refetchInterval: 5000 },
  });
  const drip = useReadContract({
    address: addresses.drip || undefined, abi: balAbi, functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!addresses.drip, refetchInterval: 5000 },
  });

  if (!contractsReady || !isConnected || !address) return null;

  const getUsdg = async () => {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch("/api/faucet", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ address }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.error || "faucet failed");
      setMsg(d.gas ? "Sent 1,000 USDG + gas ✓" : "Sent 1,000 USDG ✓");
      setTimeout(() => { usdg.refetch(); drip.refetch(); }, 3000);
    } catch (e) {
      setMsg(String(e instanceof Error ? e.message : e).slice(0, 120));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-4 mt-4 rounded-2xl border border-lime/30 bg-lime/5 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-mute">Your testnet balance</div>
          <div className="mt-0.5 text-sm font-semibold text-white">
            {fmt(usdg.data as bigint | undefined, 6)} USDG · {fmt(drip.data as bigint | undefined, 18, 4)} DRIP
          </div>
        </div>
        <button
          onClick={getUsdg}
          disabled={busy}
          className="shrink-0 rounded-lg bg-lime px-3 py-2 text-xs font-semibold text-ink disabled:opacity-60"
        >
          {busy ? "Sending…" : "Get 1,000 test USDG"}
        </button>
      </div>
      <div className="mt-2 text-[11px] text-mute">{msg ?? "Free test tokens + gas — no ETH needed, we cover it."}</div>
    </div>
  );
}
