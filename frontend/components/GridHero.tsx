"use client";

import { useEffect, useState } from "react";

// Decorative auto-playing 5×5 mine for the hero — shows the core mechanic at a glance. The real,
// interactive game is at /game. Purely visual; no funds, no chain.
const N = 25;

export function GridHero() {
  const [winner, setWinner] = useState(7);
  const [round, setRound] = useState(1);
  const [amounts] = useState<number[]>(() =>
    Array.from({ length: N }, () => Math.round(10 + Math.random() * 90)),
  );

  useEffect(() => {
    const id = setInterval(() => {
      setWinner(Math.floor(Math.random() * N));
      setRound((r) => r + 1);
    }, 1600);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="rounded-3xl border border-line bg-panel/60 p-5 backdrop-blur">
      <div className="mb-3 flex items-center justify-between text-xs">
        <span className="inline-flex items-center gap-2 rounded-full border border-lime/40 bg-lime/10 px-2.5 py-0.5 font-medium text-lime">
          <span className="h-1.5 w-1.5 rounded-full bg-lime animate-pulseDot" />
          Block Mine · round {round}
        </span>
        <span className="font-mono text-mute">25 blocks · 60s</span>
      </div>
      <div className="grid grid-cols-5 gap-1.5" aria-hidden="true">
        {Array.from({ length: N }, (_, i) => {
          const isWin = i === winner;
          return (
            <div
              key={i}
              className={`aspect-square rounded-lg border text-[9px] leading-none transition-all duration-500 ${
                isWin
                  ? "border-lime bg-lime/25 scale-[1.04]"
                  : "border-line bg-ink/60"
              }`}
            >
              <div className="flex h-full flex-col justify-between p-1">
                <span className="text-mute/50">#{i}</span>
                <span className={isWin ? "font-semibold text-lime" : "text-mute/70"}>
                  {amounts[i]}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex items-center justify-between text-xs text-mute">
        <span>
          Winning block <span className="font-semibold text-lime">#{winner}</span>
        </span>
        <span>losers&rsquo; pot → winners + buyback</span>
      </div>
    </div>
  );
}
