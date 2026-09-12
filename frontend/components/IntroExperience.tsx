"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { site, gridMine } from "@/lib/site";

// ─────────────────────────────────────────────────────────────────────────────
// The DRIP onboarding — a serious, industrial on-chain-mining intro that plays
// the moment someone lands. Deliberately NOT a casino: dark, technical, restrained
// motion, DRIP-lime as the only accent. Four scenes take a first-timer from
// "what is this?" to "I want in":
//   1 · Cold open — the wordmark + what it is, with a live dig-height ticker
//   2 · The mechanism — the real 25-block mine; one block strikes, the haul flows
//   3 · The economics — every dig's cut, split soberly (no jackpot framing)
//   4 · Enter — a plain, credible call to action
//
// Shown once per browser (localStorage), skippable, replayable ("Watch intro").
// Pure CSS transforms; collapses cleanly under prefers-reduced-motion.
// ─────────────────────────────────────────────────────────────────────────────

const SEEN_KEY = "drip.intro.seen.v2";
const REPLAY_EVENT = "drip:replay-intro";

// Scene durations (ms) for the auto-advancing progress bar.
const DURATIONS = [3600, 6600, 5600, 60000];

/** Fire this anywhere to replay the intro (used by the "Watch intro" button). */
export function replayIntro() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(REPLAY_EVENT));
}

export function IntroExperience() {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [scene, setScene] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const total = DURATIONS.length;

  const close = useCallback(() => {
    setClosing(true);
    try { localStorage.setItem(SEEN_KEY, "1"); } catch { /* private mode */ }
    setTimeout(() => { setOpen(false); setClosing(false); setScene(0); }, 500);
  }, []);

  const go = useCallback((next: number) => {
    if (next >= total) { close(); return; }
    setScene(Math.max(0, next));
  }, [total, close]);

  // First-visit trigger + explicit replay.
  useEffect(() => {
    let seen = true;
    try { seen = localStorage.getItem(SEEN_KEY) === "1"; } catch { seen = false; }
    if (!seen) { setScene(0); setOpen(true); }
    const onReplay = () => { setScene(0); setClosing(false); setOpen(true); };
    window.addEventListener(REPLAY_EVENT, onReplay);
    return () => window.removeEventListener(REPLAY_EVENT, onReplay);
  }, []);

  // Auto-advance.
  useEffect(() => {
    if (!open || closing) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => go(scene + 1), DURATIONS[scene]);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [open, closing, scene, go]);

  // Lock body scroll + Esc/arrow keys while open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowRight") go(scene + 1);
      else if (e.key === "ArrowLeft") go(scene - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", onKey); };
  }, [open, scene, go, close]);

  if (!open) return null;

  return (
    <div
      className={`fixed inset-0 z-[100] overflow-hidden mine-veil ${closing ? "veil-out" : "veil-in"}`}
      role="dialog"
      aria-modal="true"
      aria-label="Welcome to Drip"
    >
      {/* Static depth: a faint shaft-light wash + block grid. No drifting/aurora. */}
      <div className="pointer-events-none absolute inset-0 shaft-light" aria-hidden="true" />
      <div className="pointer-events-none absolute inset-0 grid-bg opacity-30" aria-hidden="true" />
      {/* Bottom rock line for a sense of ground/depth. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black to-transparent" aria-hidden="true" />

      {/* Top bar: technical header + progress + skip */}
      <div className="absolute inset-x-0 top-0 z-10 px-5 pt-5 sm:px-8">
        <div className="mx-auto max-w-content">
          <div className="mb-2.5 flex items-center justify-between font-mono text-[11px] uppercase tracking-[0.2em] text-mute/70">
            <span>DRIP · on-chain mining</span>
            <span>{site.chain}</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex flex-1 gap-1.5">
              {DURATIONS.map((_, i) => (
                <div key={i} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/10">
                  <div
                    key={`${i}-${scene}`}
                    className={`h-full origin-left rounded-full bg-lime ${
                      i < scene ? "scale-x-100" : i === scene ? "scene-progress" : "scale-x-0"
                    }`}
                    style={i === scene ? { animationDuration: `${DURATIONS[i]}ms` } : undefined}
                  />
                </div>
              ))}
            </div>
            <button
              onClick={close}
              className="shrink-0 font-mono text-[11px] uppercase tracking-wide text-mute transition-colors hover:text-white"
            >
              Skip
            </button>
          </div>
        </div>
      </div>

      {/* Scene stage — padded to clear the fixed top/bottom bars. */}
      <div className="relative z-[5] flex h-full items-center justify-center px-5 py-24">
        <div className="w-full max-w-content">
          {scene === 0 && <SceneOpen />}
          {scene === 1 && <SceneMechanism />}
          {scene === 2 && <SceneEconomics />}
          {scene === 3 && <SceneEnter onEnter={close} />}
        </div>
      </div>

      {/* Bottom nav: dots + next */}
      <div className="absolute inset-x-0 bottom-0 z-10 px-5 pb-7 sm:px-8">
        <div className="mx-auto flex max-w-content items-center justify-between">
          <div className="flex items-center gap-2">
            {DURATIONS.map((_, i) => (
              <button
                key={i}
                aria-label={`Go to scene ${i + 1}`}
                onClick={() => go(i)}
                className={`h-1.5 rounded-full transition-all ${
                  i === scene ? "w-6 bg-lime" : "w-1.5 bg-white/25 hover:bg-white/50"
                }`}
              />
            ))}
          </div>
          {scene < total - 1 ? (
            <button
              onClick={() => go(scene + 1)}
              className="rounded-lg border border-line bg-white/5 px-5 py-2 font-mono text-xs uppercase tracking-wide text-white transition-colors hover:bg-white/10"
            >
              Next →
            </button>
          ) : (
            <button
              onClick={close}
              className="rounded-lg bg-lime px-6 py-2 text-sm font-semibold text-ink transition-transform hover:scale-[1.02]"
            >
              Enter the Mine
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Scene 1 · Cold open ───────────────────────────────────────────────────────
function SceneOpen() {
  // A live-feeling dig-height counter, monospace — reads as a chain, not a game.
  const [dig, setDig] = useState(1041);
  useEffect(() => {
    const id = setInterval(() => setDig((d) => d + 1), 2600);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="text-center">
      <div className="rise rise-1 mb-6 inline-flex items-center gap-2 rounded border border-line bg-white/[0.03] px-3 py-1 font-mono text-[11px] text-mute">
        <span className="h-1.5 w-1.5 rounded-full bg-lime" /> DIG&nbsp;#{dig} · SEALING
      </div>
      <h1 className="rise rise-1 text-6xl font-bold tracking-tight text-white sm:text-8xl">DRIP</h1>
      <div className="rise rise-2 mx-auto mt-4 h-px w-24 bg-lime/70" />
      <p className="rise rise-2 mt-5 text-lg text-mute sm:text-2xl">
        Mine tokenized stock. <span className="text-white">Block by block.</span>
      </p>
      <p className="rise rise-3 mt-3 font-mono text-xs text-mute/70">
        Provably-fair · nothing minted · the team holds zero
      </p>
    </div>
  );
}

// ── Scene 2 · The mechanism (the star) ────────────────────────────────────────
function SceneMechanism() {
  const N = 25;
  const [winner, setWinner] = useState(12);
  const [dig, setDig] = useState(1041);
  const [phase, setPhase] = useState<"mining" | "struck">("mining");
  const [hash, setHash] = useState("0x9a4f…c3e1");
  const amounts = useMemo(() => Array.from({ length: N }, () => Math.round(5 + Math.random() * 95)), []);
  const haul = useMemo(() => amounts.reduce((a, b) => a + b, 0), [amounts]);

  useEffect(() => {
    let alive = true;
    const rndHash = () => {
      const h = "0123456789abcdef";
      const p = (n: number) => Array.from({ length: n }, () => h[Math.floor(Math.random() * 16)]).join("");
      return `0x${p(4)}…${p(4)}`;
    };
    const cycle = () => {
      setPhase("mining");
      setTimeout(() => { if (!alive) return; setWinner(Math.floor(Math.random() * N)); setPhase("struck"); setHash(rndHash()); }, 1700);
      setTimeout(() => { if (!alive) return; setDig((d) => d + 1); }, 3000);
    };
    cycle();
    const id = setInterval(cycle, 3200);
    return () => { alive = false; clearInterval(id); };
  }, []);

  return (
    <div className="grid items-center gap-6 lg:grid-cols-2 lg:gap-10">
      <div className="order-2 text-center lg:order-1 lg:text-left">
        <p className="rise rise-1 font-mono text-[11px] uppercase tracking-[0.25em] text-lime sm:text-xs">The mechanism</p>
        <h2 className="rise rise-2 mt-3 text-2xl font-semibold leading-tight text-white sm:text-5xl">
          25 blocks. One strikes.<br />Every 60 seconds.
        </h2>
        <p className="rise rise-3 mx-auto mt-4 max-w-md text-sm leading-relaxed text-mute sm:text-base lg:mx-0">
          Stake USDG on the blocks you back. When the dig seals, on-chain randomness marks one block —
          its miners split the haul, pro-rata.
        </p>
        <div className="rise rise-4 mt-5 inline-flex items-center gap-2.5 rounded border border-line bg-white/[0.03] px-3 py-1.5 font-mono text-[10px] text-mute sm:text-[11px]">
          <span className={`h-1.5 w-1.5 rounded-full ${phase === "struck" ? "bg-lime" : "bg-mute animate-pulseDot"}`} />
          {phase === "struck" ? `SEALED ${hash}` : "SEALING…"} · dig #{dig}
        </div>
      </div>

      <div className="order-1 mx-auto w-full max-w-[248px] lg:order-2 lg:max-w-sm">
        <div className="rounded-xl border border-line bg-panel/50 p-3 backdrop-blur sm:p-5">
          <div className="mb-2.5 flex items-center justify-between font-mono text-[10px] text-mute sm:text-[11px]">
            <span>HAUL {haul} USDG</span>
            <span>25 blocks · 60s</span>
          </div>
          <div className="grid grid-cols-5 gap-1" aria-hidden="true">
            {amounts.map((amt, i) => {
              const isWin = phase === "struck" && i === winner;
              return (
                <div
                  key={i}
                  className={`relative aspect-square rounded-md border text-[9px] leading-none transition-all duration-500 ${
                    isWin ? "flare border-lime bg-lime/25 scale-[1.05]" : "border-line/80 bg-ink/70"
                  }`}
                >
                  <div className="flex h-full flex-col justify-between p-1">
                    <span className="text-mute/45">#{i}</span>
                    <span className={isWin ? "font-semibold text-lime" : "text-mute/60"}>{amt}</span>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-line/60 pt-3 font-mono text-[11px]">
            <span className="text-mute">struck block</span>
            <span className={`transition-colors ${phase === "struck" ? "text-lime" : "text-mute/50"}`}>
              {phase === "struck" ? `#${winner} · haul → miners` : "————"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Scene 3 · The economics (sober, factual — no jackpot framing) ─────────────
function SceneEconomics() {
  // The 10% cut, split by the real contract fractions (bps of the cut).
  const parts = [
    { pct: gridMine.cutSplitBurnBps / 100, label: "Burned", desc: "supply only ever shrinks", color: "#c6f24e" },
    { pct: gridMine.cutSplitStakersBps / 100, label: "Stakers", desc: "paid to DRIP stakers", color: "#8ad24a" },
    { pct: gridMine.cutSplitWinnersBps / 100, label: "Miners · DRIP", desc: "to the block that struck", color: "#5fb0e6" },
    { pct: gridMine.cutSplitWinnersNvdaBps / 100, label: "Miners · NVDA", desc: "tokenized stock", color: "#7d8bff" },
    { pct: gridMine.cutSplitMotherlodeBps / 100, label: "Motherlode", desc: `1-in-${gridMine.motherlodeOdds} pays it all out`, color: "#e6b45f" },
  ];
  return (
    <div className="mx-auto max-w-2xl text-center">
      <p className="rise rise-1 font-mono text-xs uppercase tracking-[0.25em] text-lime">The economics</p>
      <h2 className="rise rise-2 mt-4 text-3xl font-semibold leading-tight text-white sm:text-4xl">
        Every dig, a 10% cut buys DRIP —<br className="hidden sm:block" /> and splits five ways.
      </h2>

      {/* One honest stacked bar of where the cut goes. */}
      <div className="rise rise-3 mt-8 flex h-3 w-full overflow-hidden rounded-full border border-line">
        {parts.map((p) => (
          <div key={p.label} style={{ width: `${p.pct}%`, background: p.color }} className="h-full" title={`${p.label} ${p.pct}%`} />
        ))}
      </div>

      <div className="rise rise-4 mt-6 grid gap-x-6 gap-y-3 text-left sm:grid-cols-2">
        {parts.map((p) => (
          <div key={p.label} className="flex items-baseline gap-3">
            <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: p.color }} />
            <div className="min-w-0">
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-sm font-semibold text-white">{p.pct}%</span>
                <span className="text-sm font-medium text-white">{p.label}</span>
              </div>
              <div className="text-xs text-mute">{p.desc}</div>
            </div>
          </div>
        ))}
      </div>
      <p className="rise rise-4 mt-7 font-mono text-xs text-mute/70">
        No emissions. Every DRIP paid out was bought on-chain from real trading flow.
      </p>
    </div>
  );
}

// ── Scene 4 · Enter ───────────────────────────────────────────────────────────
function SceneEnter({ onEnter }: { onEnter: () => void }) {
  return (
    <div className="text-center">
      <p className="rise rise-1 font-mono text-xs uppercase tracking-[0.25em] text-lime">Start mining</p>
      <h2 className="rise rise-2 mx-auto mt-4 max-w-3xl text-4xl font-bold leading-tight text-white sm:text-6xl">
        Mine block after block.
        <br />
        A new dig every 60 seconds.
      </h2>
      <p className="rise rise-3 mx-auto mt-5 max-w-md text-base text-mute">
        Connect your wallet, stake on a block, and harvest what you mine — in seconds. No sign-ups, no
        custody. You hold your keys the whole way.
      </p>
      <div className="rise rise-4 mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <Link
          href={site.links.game}
          onClick={onEnter}
          className="inline-flex items-center gap-2 rounded-lg bg-lime px-10 py-3.5 text-base font-semibold text-ink transition-transform hover:scale-[1.02]"
        >
          Enter the Mine <span aria-hidden="true">⛏️</span>
        </Link>
        <button
          onClick={onEnter}
          className="rounded-lg px-6 py-3.5 text-sm font-semibold text-mute transition-colors hover:text-white"
        >
          Look around first
        </button>
      </div>
      <p className="rise rise-4 mt-8 font-mono text-[11px] text-mute/60">
        Provably-fair, chance-based on-chain mining. Not available where prohibited.
      </p>
    </div>
  );
}

/** Small text button that re-opens the intro. Drop anywhere (e.g. the nav or footer). */
export function ReplayIntroButton({ className = "" }: { className?: string }) {
  return (
    <button
      onClick={() => replayIntro()}
      className={className || "text-sm font-semibold text-mute transition-colors hover:text-white"}
    >
      Watch intro
    </button>
  );
}
