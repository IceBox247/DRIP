"use client";

import { useMemo, useState } from "react";
import { AppChrome } from "@/components/AppChrome";

// Trade — ORE-style swap. Working DEMO: swap USDG <-> DRIP at a mock price, or schedule recurring
// buys. Fake balances, no chain — wires to the DRIP/USDG pool (Pons) at launch.

const PRICE = 0.0142; // demo DRIP price in USDG
const fmt = (n: number, d = 2) => n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

export default function TradePage() {
  const [dir, setDir] = useState<"buy" | "sell">("buy"); // buy = USDG->DRIP
  const [amount, setAmount] = useState(50);
  const [bal, setBal] = useState({ usdg: 784.68, drip: 12.5 });
  const [freq, setFreq] = useState<"off" | "hourly" | "daily">("off");
  const [flash, setFlash] = useState<string | null>(null);

  const fromTok = dir === "buy" ? "USDG" : "DRIP";
  const toTok = dir === "buy" ? "DRIP" : "USDG";
  const fromBal = dir === "buy" ? bal.usdg : bal.drip;
  const out = useMemo(() => (dir === "buy" ? amount / PRICE : amount * PRICE), [amount, dir]);
  const can = amount > 0 && amount <= fromBal;

  const swap = () => {
    if (!can) return;
    setBal((b) =>
      dir === "buy"
        ? { usdg: Math.round((b.usdg - amount) * 100) / 100, drip: Math.round((b.drip + out) * 1e4) / 1e4 }
        : { usdg: Math.round((b.usdg + out) * 100) / 100, drip: Math.round((b.drip - amount) * 1e4) / 1e4 },
    );
    setFlash(`Swapped ${fmt(amount, dir === "buy" ? 2 : 4)} ${fromTok} → ${fmt(out, dir === "buy" ? 4 : 2)} ${toTok}`);
    setAmount(0);
    setTimeout(() => setFlash(null), 2600);
  };

  return (
    <AppChrome>
      <div className="px-5 pt-6">
        <div className="flex items-center justify-between">
          <h1 className="text-4xl font-semibold tracking-tight text-white">Trade</h1>
          <span className="rounded-full border border-line bg-panel px-3 py-1 text-xs text-mute">DRIP / USDG</span>
        </div>
        <p className="mt-1 text-mute">Swap at market, or schedule recurring buys.</p>

        {/* Price row */}
        <div className="mt-5 grid grid-cols-3 gap-2 text-center">
          <Mini label="Price" value={`$${fmt(PRICE, 4)}`} />
          <Mini label="24h" value="+6.2%" accent />
          <Mini label="Liquidity" value="$212K" />
        </div>

        {/* Swap card */}
        <div className="mt-5 rounded-2xl border border-line bg-panel p-4">
          {/* From */}
          <Field
            label="You pay"
            token={fromTok}
            balance={fromBal}
            value={amount}
            onValue={setAmount}
            onMax={() => setAmount(dir === "buy" ? Math.floor(fromBal) : Math.round(fromBal * 1e4) / 1e4)}
          />

          {/* Flip */}
          <div className="my-2 flex justify-center">
            <button
              onClick={() => { setDir((d) => (d === "buy" ? "sell" : "buy")); setAmount(0); }}
              className="grid h-9 w-9 place-items-center rounded-full border border-line bg-ink text-mute hover:text-white"
              aria-label="Flip direction"
            >
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 4v12M6 16l-3-3M14 16V4M14 4l3 3" />
              </svg>
            </button>
          </div>

          {/* To (read-only estimate) */}
          <div className="rounded-xl border border-line bg-ink px-4 py-3">
            <div className="flex items-center justify-between text-xs text-mute">
              <span>You receive (est.)</span>
              <span>{toTok}</span>
            </div>
            <div className="mt-1 text-2xl font-semibold text-white">{fmt(out, dir === "buy" ? 4 : 2)}</div>
          </div>

          <div className="mt-3 flex justify-between text-xs text-mute">
            <span>Rate</span>
            <span>1 DRIP = ${fmt(PRICE, 4)} USDG</span>
          </div>

          <button
            onClick={swap}
            disabled={!can}
            className="mt-4 w-full rounded-2xl bg-lime py-4 text-base font-semibold text-ink disabled:cursor-not-allowed disabled:bg-panel2 disabled:text-mute"
          >
            {amount <= 0 ? "Enter an amount" : amount > fromBal ? `Not enough ${fromTok}` : dir === "buy" ? "Buy DRIP" : "Sell DRIP"}
          </button>
          {flash && <div className="mt-3 rounded-xl border border-lime/40 bg-lime/10 px-3 py-2 text-center text-sm text-lime">{flash}</div>}
        </div>

        {/* Schedule */}
        <div className="mt-5 rounded-2xl border border-line bg-panel p-4">
          <h2 className="text-sm font-semibold text-white">Schedule buys</h2>
          <p className="mt-1 text-xs text-mute">Auto-buy DRIP on a recurring basis (DCA). Demo only.</p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {(["off", "hourly", "daily"] as const).map((f) => (
              <button key={f} onClick={() => setFreq(f)}
                className={`rounded-full py-2 text-sm font-semibold capitalize ${freq === f ? "bg-white text-ink" : "bg-ink text-mute"}`}>
                {f}
              </button>
            ))}
          </div>
          {freq !== "off" && (
            <div className="mt-3 text-xs text-mute">
              Scheduled: buy {fmt(amount || 10, 0)} USDG of DRIP <span className="text-white">{freq}</span>. (Won&rsquo;t
              run in the demo.)
            </div>
          )}
        </div>

        <div className="mt-5 flex justify-between rounded-2xl border border-line bg-panel/60 px-4 py-3 text-sm">
          <span className="text-mute">Balances</span>
          <span className="font-semibold text-white">{fmt(bal.usdg)} USDG · {fmt(bal.drip, 4)} DRIP</span>
        </div>

        <p className="mt-8 text-center text-[11px] text-mute/60">Demo · fake funds, no chain. Wires to the Pons pool at launch.</p>
      </div>
    </AppChrome>
  );
}

function Mini({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-line bg-panel px-2 py-2.5">
      <div className="text-[11px] uppercase tracking-wide text-mute">{label}</div>
      <div className={`mt-0.5 text-sm font-semibold ${accent ? "text-lime" : "text-white"}`}>{value}</div>
    </div>
  );
}

function Field({
  label, token, balance, value, onValue, onMax,
}: {
  label: string; token: string; balance: number; value: number; onValue: (n: number) => void; onMax: () => void;
}) {
  return (
    <div className="rounded-xl border border-line bg-ink px-4 py-3">
      <div className="flex items-center justify-between text-xs text-mute">
        <span>{label}</span>
        <button onClick={onMax} className="hover:text-white">Balance {fmt(balance, token === "USDG" ? 2 : 4)} · MAX</button>
      </div>
      <div className="mt-1 flex items-center justify-between gap-3">
        <input
          type="number"
          inputMode="decimal"
          min={0}
          value={value || ""}
          onChange={(e) => onValue(Math.max(0, Number(e.target.value)))}
          placeholder="0"
          className="w-full bg-transparent text-2xl font-semibold text-white placeholder:text-mute focus:outline-none"
        />
        <span className="shrink-0 rounded-full border border-line bg-panel px-3 py-1 text-sm font-semibold text-white">{token}</span>
      </div>
    </div>
  );
}
