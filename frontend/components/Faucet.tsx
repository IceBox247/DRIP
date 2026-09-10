"use client";

import { useAccount, useReadContract, useWriteContract } from "wagmi";
import { formatUnits } from "viem";
import { addresses, contractsReady } from "@/lib/contracts";

// Faucet + live balances. Renders only when the game contracts are configured AND a wallet is
// connected. The testnet USDG/NVDA are open-mint mocks, so anyone can get play tokens in one tap.
// Read-only balances + a single mint write — safe, and proves the on-chain loop end-to-end.

const tokenAbi = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "mint", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [] },
] as const;

const fmt = (v: bigint | undefined, dec: number, show = 2) =>
  v === undefined ? "—" : Number(formatUnits(v, dec)).toLocaleString("en-US", { maximumFractionDigits: show });

export function Faucet() {
  const { address, isConnected } = useAccount();
  const { writeContract, isPending } = useWriteContract();

  const usdg = useReadContract({
    address: addresses.usdg || undefined, abi: tokenAbi, functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!addresses.usdg, refetchInterval: 5000 },
  });
  const drip = useReadContract({
    address: addresses.drip || undefined, abi: tokenAbi, functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!addresses.drip, refetchInterval: 5000 },
  });

  if (!contractsReady || !isConnected || !address) return null;

  const getUsdg = () =>
    writeContract(
      { address: addresses.usdg as `0x${string}`, abi: tokenAbi, functionName: "mint", args: [address, BigInt(1000) * BigInt(1_000_000)] },
      { onError: (e) => alert(e.message) },
    );

  return (
    <div className="mx-4 mt-4 rounded-2xl border border-lime/30 bg-lime/5 p-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-wide text-mute">Your testnet balance</div>
          <div className="mt-0.5 text-sm font-semibold text-white">
            {fmt(usdg.data as bigint | undefined, 6)} USDG · {fmt(drip.data as bigint | undefined, 18, 4)} DRIP
          </div>
        </div>
        <button
          onClick={getUsdg}
          disabled={isPending}
          className="rounded-lg bg-lime px-3 py-2 text-xs font-semibold text-ink disabled:opacity-60"
        >
          {isPending ? "Minting…" : "Get 1,000 test USDG"}
        </button>
      </div>
      <div className="mt-2 text-[11px] text-mute">Testnet mock tokens — free, no real value.</div>
    </div>
  );
}
