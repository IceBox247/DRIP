"use client";

import { useState } from "react";
import { AppChrome } from "@/components/AppChrome";

// Stake — demo of stake-to-earn (StakeVault). Stake DRIP, earn the 10% stakers' slice of every
// buyback. Fake funds, no chain.
const fmt = (n: number, d = 2) => n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

export default function StakePage() {
  const [tab, setTab] = useState<"deposit" | "withdraw">("deposit");
  const [amount, setAmount] = useState(0);
  const [staked, setStaked] = useState(0);
  const wallet = 12.5; // demo DRIP balance

  const submit = () => {
    if (amount <= 0) return;
    if (tab === "deposit") setStaked((s) => Math.round((s + amount) * 1e4) / 1e4);
    else setStaked((s) => Math.max(0, Math.round((s - amount) * 1e4) / 1e4));
    setAmount(0);
  };
  const base = tab === "deposit" ? wallet : staked;

  return (
    <AppChrome>
      <div className="px-5 pt-6">
        <div className="flex items-center justify-between">
          <h1 className="text-4xl font-semibold tracking-tight text-white">Stake</h1>
          <span className="rounded-full border border-line bg-panel px-3 py-1 text-xs text-mute">Liquid</span>
        </div>
        <p className="mt-1 text-mute">Earn the stakers&rsquo; slice of every buyback.</p>

        <div className="mt-6 flex justify-center gap-6">
          {(["deposit", "withdraw"] as const).map((t) => (
            <button key={t} onClick={() => { setTab(t); setAmount(0); }}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold capitalize ${tab === t ? "border border-line bg-panel text-white" : "text-mute"}`}>
              {t}
            </button>
          ))}
        </div>

        <div className="mt-8 text-center">
          <div className="text-6xl font-semibold text-white">{fmt(amount, 0)}</div>
          <div className="mt-2 text-sm text-mute">DRIP · staked {fmt(staked, 4)}</div>
        </div>

        <div className="mt-6 grid grid-cols-4 gap-2">
          {[25, 50, 75, 100].map((p) => (
            <button key={p} onClick={() => setAmount(Math.round(base * (p / 100) * 1e4) / 1e4)}
              className="rounded-full bg-panel py-3 text-sm font-semibold text-white hover:bg-panel2">
              {p === 100 ? "MAX" : `${p}%`}
            </button>
          ))}
        </div>

        <button onClick={submit} disabled={amount <= 0}
          className="mt-5 w-full rounded-2xl bg-lime py-4 text-base font-semibold text-ink capitalize disabled:cursor-not-allowed disabled:bg-panel disabled:text-mute">
          {tab}
        </button>

        <div className="mt-10">
          <h2 className="text-2xl font-semibold text-white">Summary</h2>
          <div className="mt-4 space-y-3 text-sm">
            <SummaryRow label="APR" value="18.6%" />
            <SummaryRow label="Your stake" value={`${fmt(staked, 4)} DRIP`} />
            <SummaryRow label="Source" value="10% of each buyback" />
          </div>
        </div>
        <p className="mt-8 text-center text-[11px] text-mute/60">Demo · fake funds, no chain.</p>
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
