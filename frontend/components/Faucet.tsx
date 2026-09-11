"use client";

import { useState } from "react";
import { useAccount, useReadContract, useWriteContract } from "wagmi";
import { formatUnits, parseUnits } from "viem";
import { addresses, contractsReady, isTestnet } from "@/lib/contracts";

// Faucet + live balances. Renders only when the game contracts are configured AND a wallet is
// connected. Preferred path is GASLESS: it POSTs to /api/faucet, where the keeper wallet pays the
// gas and mints test USDG. If the server faucet isn't configured (no KEEPER_PRIVATE_KEY in Vercel),
// it falls back to minting the mock USDG straight from the connected wallet (which pays its own gas).

const balAbi = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
] as const;

const mintAbi = [
  { type: "function", name: "mint", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [] },
] as const;

const fmt = (v: bigint | undefined, dec: number, show = 2) =>
  v === undefined ? "—" : Number(formatUnits(v, dec)).toLocaleString("en-US", { maximumFractionDigits: show });

export function Faucet() {
  const { address, isConnected } = useAccount();
  const { writeContractAsync } = useWriteContract();
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
  const nvda = useReadContract({
    address: addresses.nvda || undefined, abi: balAbi, functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!addresses.nvda, refetchInterval: 5000 },
  });

  if (!contractsReady || !isConnected || !address) return null;

  // Mint 1,000 mock USDG straight from the connected wallet (it pays its own gas). Used as a
  // fallback when the gasless server faucet isn't configured. The mock USDG has an open mint().
  const mintSelf = async () => {
    if (!addresses.usdg) throw new Error("USDG address not configured");
    setMsg("Confirm mint in your wallet…");
    await writeContractAsync({
      address: addresses.usdg as `0x${string}`, abi: mintAbi, functionName: "mint",
      args: [address as `0x${string}`, parseUnits("1000", 6)],
    });
    setMsg("Minted 1,000 USDG ✓");
    setTimeout(() => { usdg.refetch(); drip.refetch(); }, 3000);
  };

  const getUsdg = async () => {
    setBusy(true); setMsg(null);
    // Try the gasless server faucet first; fall back to a direct wallet mint if it isn't available.
    let useFallback = false;
    try {
      const r = await fetch("/api/faucet", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ address }),
      });
      if (r.status === 503) {
        useFallback = true; // server faucet not configured (no keeper wallet)
      } else {
        const d = await r.json();
        if (!r.ok || !d.ok) throw new Error(d.error || "faucet failed");
        setMsg(d.gas ? "Sent 1,000 USDG + gas ✓" : "Sent 1,000 USDG ✓");
        setTimeout(() => { usdg.refetch(); drip.refetch(); }, 3000);
      }
    } catch {
      useFallback = true; // network/other error reaching the server → mint from the wallet instead
    }
    if (useFallback) {
      try { await mintSelf(); }
      catch (e) { setMsg(String(e instanceof Error ? e.message : e).slice(0, 120)); }
    }
    setBusy(false);
  };

  return (
    <div className="mx-4 mt-4 rounded-2xl border border-lime/30 bg-lime/5 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-mute">{isTestnet ? "Your testnet balance" : "Your balance"}</div>
          <div className="mt-0.5 text-sm font-semibold text-white">
            {fmt(usdg.data as bigint | undefined, 6)} USDG · {fmt(drip.data as bigint | undefined, 18, 4)} DRIP
            {addresses.nvda ? ` · ${fmt(nvda.data as bigint | undefined, 18, 4)} NVDA` : ""}
          </div>
        </div>
        {/* The faucet mints mock USDG — testnet only. On mainnet, real USDG is funded by the user. */}
        {isTestnet && (
          <button
            onClick={getUsdg}
            disabled={busy}
            className="shrink-0 rounded-lg bg-lime px-3 py-2 text-xs font-semibold text-ink disabled:opacity-60"
          >
            {busy ? "Sending…" : "Get 1,000 test USDG"}
          </button>
        )}
      </div>
      <div className="mt-2 text-[11px] text-mute">
        {msg ?? (isTestnet ? "Get 1,000 test USDG to play. Testnet only — no real value." : "Fund this wallet with USDG on Robinhood Chain to play.")}
      </div>
    </div>
  );
}
