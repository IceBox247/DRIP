"use client";

import { useEffect, useState } from "react";
import { useAccount, usePublicClient, useReadContract, useWriteContract } from "wagmi";
import { parseUnits } from "viem";
import { AppChrome } from "@/components/AppChrome";
import { addresses, contractsReady, erc20Abi, ponsCurveAbi } from "@/lib/contracts";
import { compact } from "@/lib/format";

// Trade — REAL swap, both directions, straight against DRIP's Pons bonding curve:
//   Buy  USDG → DRIP  via curve.buy(quoteIn, minTokensOut, you)  (approve USDG to the curve)
//   Sell DRIP → USDG  via curve.sell(tokensIn, minQuoteOut, you) (approve DRIP to the curve)
// The "you receive" estimate is computed live from the curve's reserves (constant-product); the send
// uses a fresh on-chain simulation for an exact min-out with 3% slippage. Works until the token
// graduates to a pool (then routing moves to the pool automatically).

const SLIPPAGE_BPS = 300; // 3%

export default function TradePage() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const ready = contractsReady && !!addresses.curve && !!addresses.usdg && !!addresses.drip;
  const curveAddr = addresses.curve as `0x${string}`;

  const [dir, setDir] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState(0);
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
  const tokenReserve = useReadContract({ address: ready ? curveAddr : undefined, abi: ponsCurveAbi, functionName: "tokenReserve", query: { enabled: ready, refetchInterval: 6000 } });
  const quoteReserve = useReadContract({ address: ready ? curveAddr : undefined, abi: ponsCurveAbi, functionName: "quoteReserve", query: { enabled: ready, refetchInterval: 6000 } });
  const usdgAllowance = useReadContract({
    address: (addresses.usdg || undefined) as `0x${string}` | undefined, abi: erc20Abi, functionName: "allowance",
    args: address && addresses.curve ? [address, curveAddr] : undefined, query: { enabled: ready && !!address, refetchInterval: 10000 },
  });
  const dripAllowance = useReadContract({
    address: (addresses.drip || undefined) as `0x${string}` | undefined, abi: erc20Abi, functionName: "allowance",
    args: address && addresses.curve ? [address, curveAddr] : undefined, query: { enabled: ready && !!address, refetchInterval: 10000 },
  });

  const usdg = usdgBal.data !== undefined ? Number(usdgBal.data as bigint) / 1e6 : 0;
  const drip = dripBal.data !== undefined ? Number(dripBal.data as bigint) / 1e18 : 0;
  const TR = tokenReserve.data as bigint | undefined; // DRIP reserve (18dec)
  const QR = quoteReserve.data as bigint | undefined; // USDG reserve (6dec)

  const fromTok = dir === "buy" ? "USDG" : "DRIP";
  const toTok = dir === "buy" ? "DRIP" : "USDG";
  const fromBal = dir === "buy" ? usdg : drip;

  // Live estimate from the curve reserves (constant-product, no-fee approximation → labelled "est.").
  const [est, setEst] = useState<number | null>(null);
  useEffect(() => {
    if (!TR || !QR || amount <= 0) { setEst(null); return; }
    try {
      if (dir === "buy") {
        const inRaw = parseUnits(String(amount), 6);
        const out = (TR * inRaw) / (QR + inRaw); // DRIP raw
        setEst(Number(out) / 1e18);
      } else {
        const inRaw = parseUnits(String(amount), 18);
        const out = (QR * inRaw) / (TR + inRaw); // USDG raw
        setEst(Number(out) / 1e6);
      }
    } catch { setEst(null); }
  }, [amount, dir, TR, QR]);

  const trade = async () => {
    if (!ready) return;
    if (!isConnected) { setMsg("Connect your wallet first."); return; }
    if (amount <= 0) { setMsg("Enter an amount."); return; }
    if (amount > fromBal) { setMsg(`Not enough ${fromTok}.`); return; }
    setBusy(true); setMsg(null);
    try {
      const inRaw = dir === "buy" ? parseUnits(String(amount), 6) : parseUnits(String(amount), 18);
      const token = dir === "buy" ? (addresses.usdg as `0x${string}`) : (addresses.drip as `0x${string}`);
      const allowance = (dir === "buy" ? usdgAllowance.data : dripAllowance.data) as bigint | undefined;
      if ((allowance ?? BigInt(0)) < inRaw) {
        setMsg(`Approve ${fromTok}…`);
        const h = await writeContractAsync({ address: token, abi: erc20Abi, functionName: "approve", args: [curveAddr, inRaw] }); // exact amount — no "unlimited" warning
        setMsg("Waiting for approval…");
        if (publicClient) await publicClient.waitForTransactionReceipt({ hash: h });
      }
      // Exact quote via simulation → min-out with slippage.
      setMsg("Fetching quote…");
      let minOut = BigInt(0);
      if (publicClient && address) {
        const { result } = await publicClient.simulateContract({
          address: curveAddr, abi: ponsCurveAbi, functionName: dir === "buy" ? "buy" : "sell",
          args: [inRaw, BigInt(0), address], account: address,
        });
        minOut = ((result as bigint) * BigInt(10000 - SLIPPAGE_BPS)) / BigInt(10000);
      }
      setMsg(dir === "buy" ? "Buying DRIP…" : "Selling DRIP…");
      await writeContractAsync({
        address: curveAddr, abi: ponsCurveAbi, functionName: dir === "buy" ? "buy" : "sell",
        args: [inRaw, minOut, address as `0x${string}`],
      });
      setMsg(dir === "buy" ? "Bought DRIP ✓" : "Sold DRIP ✓");
      setAmount(0); setEst(null);
      setTimeout(() => { usdgBal.refetch(); dripBal.refetch(); usdgAllowance.refetch(); dripAllowance.refetch(); tokenReserve.refetch(); quoteReserve.refetch(); }, 3000);
    } catch (e) {
      setMsg(e instanceof Error ? e.message.slice(0, 120) : "swap failed");
    } finally {
      setBusy(false);
    }
  };

  const rate = TR && QR ? (Number(QR) / 1e6) / (Number(TR) / 1e18) : null; // USDG per DRIP

  return (
    <AppChrome>
      <div className="px-5 pt-6">
        <div className="flex items-center justify-between">
          <h1 className="text-4xl font-semibold tracking-tight text-white">Trade</h1>
          <span className="rounded-full border border-line bg-panel px-3 py-1 text-xs text-mute">DRIP / USDG</span>
        </div>
        <p className="mt-1 text-mute">Buy or sell DRIP on the Pons curve.</p>

        {/* Buy / Sell */}
        <div className="mt-5 inline-flex w-full rounded-full border border-line bg-panel p-1">
          {(["buy", "sell"] as const).map((d) => (
            <button key={d} onClick={() => { setDir(d); setAmount(0); setEst(null); setMsg(null); }}
              className={`flex-1 rounded-full py-2 text-sm font-semibold capitalize ${dir === d ? "bg-white text-ink" : "text-mute"}`}>
              {d} DRIP
            </button>
          ))}
        </div>

        <div className="mt-5 rounded-2xl border border-line bg-panel p-4">
          {/* Pay */}
          <div className="rounded-xl border border-line bg-ink px-4 py-3">
            <div className="flex items-center justify-between text-xs text-mute">
              <span>You pay</span>
              <button onClick={() => setAmount(dir === "buy" ? Math.floor(usdg * 100) / 100 : Math.floor(drip * 1e6) / 1e6)} className="hover:text-white">
                Balance {compact(fromBal)} · MAX
              </button>
            </div>
            <div className="mt-1 flex items-center justify-between gap-3">
              <input
                type="number" inputMode="decimal" min={0} step="any" value={amount || ""}
                onChange={(e) => setAmount(Math.max(0, Number(e.target.value)))} placeholder="0"
                className="w-full bg-transparent text-2xl font-semibold text-white placeholder:text-mute focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
              <span className="shrink-0 rounded-full border border-line bg-panel px-3 py-1 text-sm font-semibold text-white">{fromTok}</span>
            </div>
          </div>

          {/* Receive */}
          <div className="mt-3 rounded-xl border border-line bg-ink px-4 py-3">
            <div className="flex items-center justify-between text-xs text-mute"><span>You receive (est.)</span><span>{toTok}</span></div>
            <div className="mt-1 text-2xl font-semibold text-white">{amount <= 0 || est === null ? "0" : compact(est)}</div>
          </div>

          <div className="mt-3 flex justify-between text-xs text-mute">
            <span>Rate</span>
            <span>{rate !== null ? `1 DRIP ≈ ${rate.toPrecision(3)} USDG` : "—"}</span>
          </div>

          <button onClick={trade} disabled={busy || amount <= 0 || (ready && !isConnected)}
            className="mt-4 w-full rounded-2xl bg-lime py-4 text-base font-semibold text-ink disabled:cursor-not-allowed disabled:bg-panel2 disabled:text-mute">
            {ready && !isConnected ? "Connect wallet" : busy ? "Working…" : amount <= 0 ? "Enter an amount" : amount > fromBal ? `Not enough ${fromTok}` : dir === "buy" ? "Buy DRIP" : "Sell DRIP"}
          </button>
          {msg && <p className="mt-2 text-center text-[11px] text-lime">{msg}</p>}
          {dir === "sell" && drip <= 0 && (
            <p className="mt-1 text-center text-[11px] text-mute/70">You have no DRIP in your wallet — refine your mined DRIP first (Mine → Rewards).</p>
          )}
        </div>

        <div className="mt-5 flex justify-between rounded-2xl border border-line bg-panel/60 px-4 py-3 text-sm">
          <span className="text-mute">Your balances</span>
          <span className="font-semibold text-white">{compact(usdg)} USDG · {compact(drip)} DRIP</span>
        </div>

        <p className="mt-8 text-center text-[11px] text-mute/60">On-chain · Pons bonding curve. 3% max slippage. Buy &amp; sell both live.</p>
      </div>
    </AppChrome>
  );
}
