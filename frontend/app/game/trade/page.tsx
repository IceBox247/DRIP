"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccount, usePublicClient, useReadContract, useWriteContract } from "wagmi";
import { formatUnits, maxUint256, parseUnits } from "viem";
import { AppChrome } from "@/components/AppChrome";
import { addresses, contractsReady, erc20Abi, swapAdapterAbi } from "@/lib/contracts";
import { compact } from "@/lib/format";

// Trade — REAL swap. Buying DRIP (USDG→DRIP) routes through the deployed PonsSwapAdapter, which buys
// from the Pons bonding curve and sends DRIP to the caller. The quote is a real on-chain simulation of
// the swap, and the min-out applies 3% slippage. Selling DRIP is NOT available while FLYCOINHUNT's
// liquidity sits in the Pons bonding curve (curves are buy-only until they graduate to a pool).

const fmt = (n: number, d = 4) => n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const SLIPPAGE_BPS = 300; // 3%

export default function TradePage() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const ready = contractsReady && !!addresses.adapter && !!addresses.usdg && !!addresses.drip;

  const [dir, setDir] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState(0);
  const [est, setEst] = useState<number | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const usdgBal = useReadContract({
    address: (addresses.usdg || undefined) as `0x${string}` | undefined, abi: erc20Abi, functionName: "balanceOf",
    args: address ? [address] : undefined, query: { enabled: ready && !!address, refetchInterval: 6000 },
  });
  const dripBal = useReadContract({
    address: (addresses.drip || undefined) as `0x${string}` | undefined, abi: erc20Abi, functionName: "balanceOf",
    args: address ? [address] : undefined, query: { enabled: ready && !!address, refetchInterval: 6000 },
  });
  const allowance = useReadContract({
    address: (addresses.usdg || undefined) as `0x${string}` | undefined, abi: erc20Abi, functionName: "allowance",
    args: address && addresses.adapter ? [address, addresses.adapter as `0x${string}`] : undefined,
    query: { enabled: ready && !!address, refetchInterval: 10000 },
  });

  const usdg = usdgBal.data !== undefined ? Number(usdgBal.data as bigint) / 1e6 : 0;
  const drip = dripBal.data !== undefined ? Number(dripBal.data as bigint) / 1e18 : 0;
  const fromBal = dir === "buy" ? usdg : drip;

  // Real quote: simulate the adapter swap on-chain. Needs the USDG allowance in place (the sim runs
  // transferFrom); if it isn't, we can't quote until the one-time approval is done.
  const quote = useCallback(async (amt: number): Promise<bigint | null> => {
    if (!publicClient || !address || !ready || amt <= 0) return null;
    const amountIn = parseUnits(String(amt), 6);
    const cur = (allowance.data as bigint | undefined) ?? BigInt(0);
    if (cur < amountIn) return null; // approval needed first
    try {
      const { result } = await publicClient.simulateContract({
        address: addresses.adapter as `0x${string}`, abi: swapAdapterAbi, functionName: "swapExactIn",
        args: [addresses.usdg as `0x${string}`, addresses.drip as `0x${string}`, amountIn, BigInt(0)], account: address,
      });
      return result as bigint;
    } catch {
      return null;
    }
  }, [publicClient, address, ready, allowance.data]);

  // Debounced live quote as the user types (buy only).
  useEffect(() => {
    if (dir !== "buy" || amount <= 0) { setEst(null); return; }
    let cancelled = false;
    setQuoting(true);
    const id = setTimeout(async () => {
      const out = await quote(amount);
      if (!cancelled) { setEst(out !== null ? Number(out) / 1e18 : null); setQuoting(false); }
    }, 500);
    return () => { cancelled = true; clearTimeout(id); setQuoting(false); };
  }, [amount, dir, quote]);

  const buy = async () => {
    if (!ready) return;
    if (!isConnected) { setMsg("Connect your wallet first."); return; }
    if (amount <= 0) { setMsg("Enter an amount."); return; }
    if (amount > usdg) { setMsg("Not enough USDG."); return; }
    setBusy(true); setMsg(null);
    try {
      const amountIn = parseUnits(String(amount), 6);
      const cur = (allowance.data as bigint | undefined) ?? BigInt(0);
      if (cur < amountIn) {
        setMsg("Approve USDG (one time)…");
        const h = await writeContractAsync({
          address: addresses.usdg as `0x${string}`, abi: erc20Abi, functionName: "approve",
          args: [addresses.adapter as `0x${string}`, maxUint256],
        });
        setMsg("Waiting for approval…");
        if (publicClient) await publicClient.waitForTransactionReceipt({ hash: h });
        await allowance.refetch();
      }
      // Fresh quote → min-out with 3% slippage.
      setMsg("Fetching quote…");
      const expected = await quote(amount);
      const minOut = expected !== null ? (expected * BigInt(10000 - SLIPPAGE_BPS)) / BigInt(10000) : BigInt(0);
      setMsg("Buying DRIP…");
      await writeContractAsync({
        address: addresses.adapter as `0x${string}`, abi: swapAdapterAbi, functionName: "swapExactIn",
        args: [addresses.usdg as `0x${string}`, addresses.drip as `0x${string}`, amountIn, minOut],
      });
      setMsg("Bought DRIP ✓");
      setAmount(0); setEst(null);
      setTimeout(() => { usdgBal.refetch(); dripBal.refetch(); allowance.refetch(); }, 3000);
    } catch (e) {
      setMsg(e instanceof Error ? e.message.slice(0, 120) : "swap failed");
    } finally {
      setBusy(false);
    }
  };

  const rate = est !== null && amount > 0 ? amount / est : null; // USDG per DRIP

  return (
    <AppChrome>
      <div className="px-5 pt-6">
        <div className="flex items-center justify-between">
          <h1 className="text-4xl font-semibold tracking-tight text-white">Trade</h1>
          <span className="rounded-full border border-line bg-panel px-3 py-1 text-xs text-mute">DRIP / USDG</span>
        </div>
        <p className="mt-1 text-mute">Buy DRIP straight from the Pons curve.</p>

        {/* Buy / Sell */}
        <div className="mt-5 inline-flex w-full rounded-full border border-line bg-panel p-1">
          {(["buy", "sell"] as const).map((d) => (
            <button key={d} onClick={() => { setDir(d); setAmount(0); setEst(null); }}
              className={`flex-1 rounded-full py-2 text-sm font-semibold capitalize ${dir === d ? "bg-white text-ink" : "text-mute"}`}>
              {d} DRIP
            </button>
          ))}
        </div>

        {dir === "sell" ? (
          <div className="mt-5 rounded-2xl border border-yellow-500/30 bg-yellow-500/5 p-4 text-sm text-mute">
            <div className="font-semibold text-yellow-500">Selling isn&rsquo;t available in-app yet.</div>
            <p className="mt-1.5 text-xs leading-relaxed">
              DRIP&rsquo;s liquidity is held in the Pons bonding curve, which only supports buys until the
              token graduates to a pool. To sell, use the token&rsquo;s page on Pons or your wallet&rsquo;s swap.
              In-app selling turns on automatically once DRIP graduates to its Uniswap pool.
            </p>
          </div>
        ) : (
          <div className="mt-5 rounded-2xl border border-line bg-panel p-4">
            {/* Pay */}
            <div className="rounded-xl border border-line bg-ink px-4 py-3">
              <div className="flex items-center justify-between text-xs text-mute">
                <span>You pay</span>
                <button onClick={() => setAmount(Math.floor(usdg * 100) / 100)} className="hover:text-white">Balance {fmt(usdg, 2)} · MAX</button>
              </div>
              <div className="mt-1 flex items-center justify-between gap-3">
                <input
                  type="number" inputMode="decimal" min={0} step="any" value={amount || ""}
                  onChange={(e) => setAmount(Math.max(0, Number(e.target.value)))} placeholder="0"
                  className="w-full bg-transparent text-2xl font-semibold text-white placeholder:text-mute focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
                <span className="shrink-0 rounded-full border border-line bg-panel px-3 py-1 text-sm font-semibold text-white">USDG</span>
              </div>
            </div>

            {/* Receive (real on-chain estimate) */}
            <div className="mt-3 rounded-xl border border-line bg-ink px-4 py-3">
              <div className="flex items-center justify-between text-xs text-mute">
                <span>You receive (est.)</span><span>DRIP</span>
              </div>
              <div className="mt-1 text-2xl font-semibold text-white">
                {amount <= 0 ? "0.0000" : quoting ? "…" : est !== null ? compact(est) : "—"}
              </div>
            </div>

            <div className="mt-3 flex justify-between text-xs text-mute">
              <span>Rate</span>
              <span>{rate !== null ? `1 DRIP ≈ ${fmt(rate, 4)} USDG` : "quote after approval"}</span>
            </div>

            <button onClick={buy} disabled={busy || amount <= 0 || (ready && !isConnected)}
              className="mt-4 w-full rounded-2xl bg-lime py-4 text-base font-semibold text-ink disabled:cursor-not-allowed disabled:bg-panel2 disabled:text-mute">
              {ready && !isConnected ? "Connect wallet" : busy ? "Working…" : amount <= 0 ? "Enter an amount" : amount > usdg ? "Not enough USDG" : "Buy DRIP"}
            </button>
            {msg && <p className="mt-2 text-center text-[11px] text-lime">{msg}</p>}
            {est === null && amount > 0 && !quoting && (
              <p className="mt-1 text-center text-[11px] text-mute/70">Approve USDG once to enable a live quote.</p>
            )}
          </div>
        )}

        <div className="mt-5 flex justify-between rounded-2xl border border-line bg-panel/60 px-4 py-3 text-sm">
          <span className="text-mute">Your balances</span>
          <span className="font-semibold text-white">{compact(usdg)} USDG · {compact(drip)} DRIP</span>
        </div>

        <p className="mt-8 text-center text-[11px] text-mute/60">On-chain · buys route through the Pons bonding curve. 3% max slippage.</p>
      </div>
    </AppChrome>
  );
}
