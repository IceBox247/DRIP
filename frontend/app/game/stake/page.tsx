"use client";

import { useState } from "react";
import { useAccount, usePublicClient, useReadContract, useWriteContract } from "wagmi";
import { formatUnits, parseUnits } from "viem";
import { AppChrome } from "@/components/AppChrome";
import { addresses, contractsReady, erc20Abi } from "@/lib/contracts";
import { compact, friendlyError } from "@/lib/format";

// Stake — REAL stake-to-earn against StakeVault on Robinhood Chain. Stake DRIP, earn the 10% stakers'
// slice of every buyback (paid in DRIP). Reads staked/earned/totalStaked on-chain; stake/withdraw/
// claim are real transactions. No demo funds.

const stakeAbi = [
  { type: "function", name: "stake", stateMutability: "nonpayable", inputs: [{ type: "uint256" }], outputs: [] },
  { type: "function", name: "withdraw", stateMutability: "nonpayable", inputs: [{ type: "uint256" }], outputs: [] },
  { type: "function", name: "getReward", stateMutability: "nonpayable", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "earned", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "staked", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "totalStaked", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
] as const;

const fmt = (n: number, d = 4) => n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const num = (v: unknown) => (v !== undefined ? Number(v as bigint) / 1e18 : 0);

export default function StakePage() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const ready = contractsReady && !!addresses.stake && !!addresses.drip;

  const [tab, setTab] = useState<"deposit" | "withdraw">("deposit");
  const [amount, setAmount] = useState(0);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const stake = { address: (addresses.stake || undefined) as `0x${string}` | undefined, abi: stakeAbi } as const;
  const dripBal = useReadContract({
    address: (addresses.drip || undefined) as `0x${string}` | undefined, abi: erc20Abi, functionName: "balanceOf",
    args: address ? [address] : undefined, query: { enabled: ready && !!address, refetchInterval: 6000 },
  });
  const staked = useReadContract({ ...stake, functionName: "staked", args: address ? [address] : undefined, query: { enabled: ready && !!address, refetchInterval: 6000 } });
  const earned = useReadContract({ ...stake, functionName: "earned", args: address ? [address] : undefined, query: { enabled: ready && !!address, refetchInterval: 6000 } });
  const total = useReadContract({ ...stake, functionName: "totalStaked", query: { enabled: ready, refetchInterval: 8000 } });
  const allowance = useReadContract({
    address: (addresses.drip || undefined) as `0x${string}` | undefined, abi: erc20Abi, functionName: "allowance",
    args: address && addresses.stake ? [address, addresses.stake as `0x${string}`] : undefined,
    query: { enabled: ready && !!address, refetchInterval: 10000 },
  });

  const walletDrip = num(dripBal.data);
  const stakedShown = num(staked.data);
  const earnedShown = num(earned.data);
  const totalShown = num(total.data);
  const base = tab === "deposit" ? walletDrip : stakedShown;

  const refetch = () => { dripBal.refetch(); staked.refetch(); earned.refetch(); total.refetch(); allowance.refetch(); };

  const submit = async () => {
    if (!ready) return;
    if (!isConnected) { setMsg("Connect your wallet first."); return; }
    if (amount <= 0) { setMsg("Enter an amount."); return; }
    setBusy(true); setMsg(null);
    try {
      const amt = parseUnits(String(amount), 18);
      if (tab === "deposit") {
        const cur = (allowance.data as bigint | undefined) ?? BigInt(0);
        if (cur < amt) {
          setMsg("Approve DRIP…");
          const h = await writeContractAsync({
            address: addresses.drip as `0x${string}`, abi: erc20Abi, functionName: "approve",
            args: [addresses.stake as `0x${string}`, amt], // exact amount — avoids the "unlimited" wallet warning
          });
          setMsg("Waiting for approval…");
          if (publicClient) await publicClient.waitForTransactionReceipt({ hash: h });
        }
        setMsg("Staking…");
        await writeContractAsync({ address: addresses.stake as `0x${string}`, abi: stakeAbi, functionName: "stake", args: [amt] });
        setMsg("Staked ✓");
      } else {
        setMsg("Withdrawing…");
        await writeContractAsync({ address: addresses.stake as `0x${string}`, abi: stakeAbi, functionName: "withdraw", args: [amt] });
        setMsg("Withdrawn ✓");
      }
      setAmount(0);
      setTimeout(refetch, 3000);
    } catch (e) {
      setMsg(friendlyError(e, "Transaction failed — please try again."));
    } finally {
      setBusy(false);
    }
  };

  const claim = async () => {
    if (!ready || !isConnected || earnedShown <= 0) return;
    setBusy(true); setMsg(null);
    try {
      setMsg("Claiming rewards…");
      await writeContractAsync({ address: addresses.stake as `0x${string}`, abi: stakeAbi, functionName: "getReward" });
      setMsg("Rewards claimed ✓");
      setTimeout(refetch, 3000);
    } catch (e) {
      setMsg(friendlyError(e, "Couldn't claim — please try again."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppChrome>
      <div className="px-5 pt-6">
        <div className="flex items-center justify-between">
          <h1 className="text-4xl font-semibold tracking-tight text-white">Stake</h1>
          <span className="rounded-full border border-line bg-panel px-3 py-1 text-xs text-mute">Liquid</span>
        </div>
        <p className="mt-1 text-mute">Stake DRIP, earn the stakers&rsquo; slice of every buyback.</p>

        <div className="mt-6 flex justify-center gap-6">
          {(["deposit", "withdraw"] as const).map((t) => (
            <button key={t} onClick={() => { setTab(t); setAmount(0); }}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold capitalize ${tab === t ? "border border-line bg-panel text-white" : "text-mute"}`}>
              {t}
            </button>
          ))}
        </div>

        <div className="mt-8 text-center">
          <input
            type="number" inputMode="decimal" min={0} step="any" value={amount || ""}
            onChange={(e) => setAmount(Math.max(0, Number(e.target.value)))} placeholder="0"
            aria-label="Amount in DRIP"
            className="w-full bg-transparent text-center text-6xl font-semibold tracking-tight text-white placeholder:text-mute/40 focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
          <div className="mt-2 text-sm text-mute">
            DRIP · {tab === "deposit" ? `wallet ${compact(walletDrip)}` : `staked ${compact(stakedShown)}`}
          </div>
        </div>

        <div className="mt-6 grid grid-cols-4 gap-2">
          {[25, 50, 75, 100].map((p) => (
            <button key={p} onClick={() => setAmount(Math.round(base * (p / 100) * 1e6) / 1e6)}
              className="rounded-full bg-panel py-3 text-sm font-semibold text-white hover:bg-panel2">
              {p === 100 ? "MAX" : `${p}%`}
            </button>
          ))}
        </div>

        <button onClick={submit} disabled={busy || amount <= 0 || (ready && !isConnected)}
          className="mt-5 w-full rounded-2xl bg-lime py-4 text-base font-semibold text-ink capitalize disabled:cursor-not-allowed disabled:bg-panel disabled:text-mute">
          {ready && !isConnected ? "Connect wallet to stake" : busy ? "Working…" : tab}
        </button>
        {msg && <p className="mt-2 text-center text-[11px] text-lime">{msg}</p>}

        {/* Claimable staking rewards (real earned() from the vault). */}
        <div className="mt-6 flex items-center justify-between rounded-2xl border border-line bg-panel p-4">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-mute">Claimable rewards</div>
            <div className="mt-0.5 text-xl font-semibold text-white">{compact(earnedShown)} DRIP</div>
          </div>
          <button onClick={claim} disabled={busy || earnedShown <= 0}
            className="rounded-xl bg-lime px-4 py-2.5 text-sm font-semibold text-ink disabled:cursor-not-allowed disabled:bg-lime/30 disabled:text-ink/60">
            Claim
          </button>
        </div>

        <div className="mt-6">
          <h2 className="text-2xl font-semibold text-white">Summary</h2>
          <div className="mt-4 space-y-3 text-sm">
            <SummaryRow label="Your stake" value={`${compact(stakedShown)} DRIP`} />
            <SummaryRow label="Total staked" value={`${compact(totalShown)} DRIP`} />
            <SummaryRow label="Your share" value={totalShown > 0 ? `${fmt((stakedShown / totalShown) * 100, 2)}%` : "—"} />
            <SummaryRow label="Source" value="10% of each buyback" />
          </div>
        </div>
        <p className="mt-8 text-center text-[11px] text-mute/60">
          On-chain · Robinhood Chain. Rewards accrue as the game buys DRIP each round.
        </p>
      </div>
    </AppChrome>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-line/40 pb-3">
      <span className="text-xs uppercase tracking-wide text-mute">{label}</span>
      <span className="font-semibold text-white">{value}</span>
    </div>
  );
}
