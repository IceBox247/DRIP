"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { site } from "@/lib/site";

// ─────────────────────────────────────────────────────────────────────────────
// The DRIP onboarding — a full-screen, motion-rich intro that plays the moment
// someone lands. Five auto-advancing scenes take a first-timer from "what is
// this?" to "I want in": brand ignition → the premise → the live mining
// mechanic (moving!) → the rewards → the call to action.
//
// Shown once per browser (localStorage), skippable, and replayable from the
// site (see <ReplayIntroButton/>). Pure CSS transforms — no animation library —
// and fully collapses under prefers-reduced-motion.
// ─────────────────────────────────────────────────────────────────────────────

const SEEN_KEY = "drip.intro.seen.v1";
const REPLAY_EVENT = "drip:replay-intro";

// Scene durations (ms) for the auto-advancing progress bar.
const DURATIONS = [3200, 5200, 6400, 5200, 60000];

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
    setTimeout(() => { setOpen(false); setClosing(false); setScene(0); }, 550);
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
      className={`fixed inset-0 z-[100] overflow-hidden intro-veil ${closing ? "veil-out" : "veil-in"}`}
      role="dialog"
      aria-modal="true"
      aria-label="Welcome to Drip"
    >
      {/* Drifting aurora + subtle grid */}
      <div className="pointer-events-none absolute inset-0 aurora" aria-hidden="true" />
      <div className="pointer-events-none absolute inset-0 grid-bg opacity-40" aria-hidden="true" />

      {/* Top bar: progress + skip */}
      <div className="absolute inset-x-0 top-0 z-10 px-5 pt-5 sm:px-8">
        <div className="mx-auto flex max-w-content items-center gap-3">
          <div className="flex flex-1 gap-1.5">
            {DURATIONS.map((_, i) => (
              <div key={i} className="h-1 flex-1 overflow-hidden rounded-full bg-white/10">
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
            className="shrink-0 rounded-full border border-white/15 px-3.5 py-1 text-xs font-semibold text-mute transition-colors hover:border-white/40 hover:text-white"
          >
            Skip intro
          </button>
        </div>
      </div>

      {/* Scene stage */}
      <div className="relative z-[5] flex h-full items-center justify-center px-5">
        <div className="w-full max-w-content">
          {scene === 0 && <SceneIgnition />}
          {scene === 1 && <ScenePremise />}
          {scene === 2 && <SceneMechanic />}
          {scene === 3 && <SceneRewards />}
          {scene === 4 && <SceneCTA onEnter={close} />}
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
                className={`h-2 rounded-full transition-all ${
                  i === scene ? "w-6 bg-lime" : "w-2 bg-white/25 hover:bg-white/50"
                }`}
              />
            ))}
          </div>
          {scene < total - 1 ? (
            <button
              onClick={() => go(scene + 1)}
              className="rounded-full bg-white/10 px-5 py-2 text-sm font-semibold text-white backdrop-blur transition-colors hover:bg-white/20"
            >
              Next →
            </button>
          ) : (
            <button
              onClick={close}
              className="rounded-full bg-lime px-6 py-2 text-sm font-semibold text-ink transition-transform hover:scale-[1.03]"
            >
              Enter the Mine
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Scene 1 · Brand ignition ──────────────────────────────────────────────────
function SceneIgnition() {
  return (
    <div className="text-center">
      <div className="relative mx-auto mb-6 h-16 w-16">
        {/* falling droplets */}
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="drip absolute left-1/2 top-0 block h-3 w-2 -translate-x-1/2 rounded-b-full rounded-t-[40%] bg-lime"
            style={{ animationDelay: `${i * 0.85}s` }}
            aria-hidden="true"
          />
        ))}
        <span className="absolute inset-0 rounded-full border border-lime/40 bg-lime/10" />
      </div>
      <h1 className="rise rise-1 text-6xl font-bold tracking-tight sm:text-8xl">
        <span className="shimmer">DRIP</span>
      </h1>
      <p className="rise rise-2 mt-5 text-lg text-mute sm:text-2xl">
        Hold DRIP. <span className="text-white">Mine tokenized stock.</span>
      </p>
      <p className="rise rise-3 mt-3 text-sm text-mute/70">
        On {site.chain} · a round every 60 seconds
      </p>
    </div>
  );
}

// ── Scene 2 · The premise ─────────────────────────────────────────────────────
function ScenePremise() {
  const truths = [
    { k: "0%", v: "team allocation", d: "Fair launch. The team holds no tokens." },
    { k: "0", v: "tokens minted", d: "Nothing is printed. Supply only ever burns." },
    { k: "1-in-25", v: "on-chain RNG", d: "A block wins by verifiable randomness. Nobody can rig it." },
  ];
  return (
    <div className="text-center">
      <p className="rise rise-1 text-sm font-semibold uppercase tracking-[0.3em] text-lime">The idea</p>
      <h2 className="rise rise-2 mx-auto mt-4 max-w-3xl text-3xl font-semibold leading-tight text-white sm:text-5xl">
        Stake on a block. If it wins, you take the pot —
        <span className="text-lime"> in real USDG and DRIP.</span>
      </h2>
      <div className="mt-10 grid gap-4 sm:grid-cols-3">
        {truths.map((t, i) => (
          <div
            key={t.v}
            className={`rise rise-${i + 2} rounded-2xl border border-line bg-panel/60 p-5 text-left backdrop-blur`}
          >
            <div className="text-3xl font-bold text-lime">{t.k}</div>
            <div className="mt-1 text-sm font-semibold text-white">{t.v}</div>
            <p className="mt-1.5 text-xs leading-relaxed text-mute">{t.d}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Scene 3 · The mechanic, LIVE ──────────────────────────────────────────────
function SceneMechanic() {
  const N = 25;
  const [winner, setWinner] = useState(12);
  const [round, setRound] = useState(1041);
  const [reveal, setReveal] = useState(false);
  const amounts = useMemo(() => Array.from({ length: N }, () => Math.round(5 + Math.random() * 95)), []);

  useEffect(() => {
    let alive = true;
    const cycle = () => {
      setReveal(false);
      setTimeout(() => { if (!alive) return; setWinner(Math.floor(Math.random() * N)); setReveal(true); }, 1400);
      setTimeout(() => { if (!alive) return; setRound((r) => r + 1); }, 2600);
    };
    cycle();
    const id = setInterval(cycle, 2800);
    return () => { alive = false; clearInterval(id); };
  }, []);

  const pot = useMemo(() => amounts.reduce((a, b) => a + b, 0), [amounts]);

  return (
    <div className="grid items-center gap-10 lg:grid-cols-2">
      <div className="order-2 text-center lg:order-1 lg:text-left">
        <p className="rise rise-1 text-sm font-semibold uppercase tracking-[0.3em] text-lime">How it plays</p>
        <h2 className="rise rise-2 mt-4 text-3xl font-semibold leading-tight text-white sm:text-5xl">
          25 blocks.<br />One winner.<br />Every 60 seconds.
        </h2>
        <p className="rise rise-3 mt-5 max-w-md text-base leading-relaxed text-mute lg:mx-0">
          Deploy USDG onto the blocks you feel. When the round closes, on-chain RNG lights one up —
          and everyone who staked it splits the losers&rsquo; pot pro-rata.
        </p>
        <div className="rise rise-4 mt-6 inline-flex items-center gap-2 rounded-full border border-lime/40 bg-lime/10 px-4 py-1.5 text-sm font-semibold text-lime">
          <span className="h-2 w-2 rounded-full bg-lime animate-pulseDot" /> Live · round {round}
        </div>
      </div>

      <div className="order-1 mx-auto w-full max-w-sm lg:order-2">
        <div className="rounded-3xl border border-line bg-panel/60 p-4 backdrop-blur sm:p-5">
          <div className="mb-3 flex items-center justify-between text-xs text-mute">
            <span className="font-mono">POT {pot} USDG</span>
            <span className="font-mono">25 blocks · 60s</span>
          </div>
          <div className="grid grid-cols-5 gap-1.5" aria-hidden="true">
            {amounts.map((amt, i) => {
              const isWin = reveal && i === winner;
              return (
                <div
                  key={i}
                  className={`tile-pop relative aspect-square rounded-lg border text-[9px] leading-none transition-all duration-500 ${
                    isWin ? "flare border-lime bg-lime/30 scale-[1.06]" : "border-line bg-ink/60"
                  }`}
                  style={{ animationDelay: `${(i % 5) * 0.03 + Math.floor(i / 5) * 0.03}s` }}
                >
                  <div className="flex h-full flex-col justify-between p-1">
                    <span className="text-mute/50">#{i}</span>
                    <span className={isWin ? "font-semibold text-lime" : "text-mute/70"}>{amt}</span>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex items-center justify-between text-xs">
            <span className="text-mute">Winning block</span>
            <span className={`font-semibold transition-colors ${reveal ? "text-lime" : "text-mute/50"}`}>
              {reveal ? `#${winner} · pot → winners` : "settling…"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Scene 4 · The rewards ─────────────────────────────────────────────────────
function useCountUp(target: number, ms: number, decimals = 0) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf = 0; const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / ms);
      const eased = 1 - Math.pow(1 - p, 3);
      setV(target * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function SceneRewards() {
  const usdg = useCountUp(1240, 1400, 0);
  const drip = useCountUp(86400, 1600, 0);
  const nvda = useCountUp(0.42, 1500, 2);
  const chips = [
    { i: 0, cls: "floaty", label: "Winners split", val: `${usdg} USDG`, sub: "losers' pot, pro-rata", tone: "text-lime" },
    { i: 1, cls: "floaty floaty-2", label: "DRIP burned", val: `${drip} 🔥`, sub: "70% of every buyback", tone: "text-white" },
    { i: 2, cls: "floaty floaty-3", label: "Winners also earn", val: `${nvda} NVDA`, sub: "tokenized stock", tone: "text-white" },
    { i: 3, cls: "floaty floaty-4", label: "The Motherlode", val: "1-in-625", sub: "a jackpot round can hit", tone: "text-lime" },
  ];
  return (
    <div className="text-center">
      <p className="rise rise-1 text-sm font-semibold uppercase tracking-[0.3em] text-lime">Where it flows</p>
      <h2 className="rise rise-2 mx-auto mt-4 max-w-3xl text-3xl font-semibold leading-tight text-white sm:text-5xl">
        Every round pays four ways.
      </h2>
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {chips.map((c) => (
          <div
            key={c.label}
            className={`${c.cls} rounded-2xl border border-line bg-panel/60 p-5 backdrop-blur`}
          >
            <div className="text-xs font-semibold uppercase tracking-wide text-mute">{c.label}</div>
            <div className={`mt-2 text-2xl font-bold tabular-nums ${c.tone}`}>{c.val}</div>
            <div className="mt-1 text-xs text-mute/80">{c.sub}</div>
          </div>
        ))}
      </div>
      <p className="rise rise-4 mt-8 text-sm text-mute">
        Nothing is minted. Refined DRIP, staking rewards, and burns all come from real trading flow.
      </p>
    </div>
  );
}

// ── Scene 5 · Call to action ──────────────────────────────────────────────────
function SceneCTA({ onEnter }: { onEnter: () => void }) {
  return (
    <div className="text-center">
      <h2 className="rise rise-1 mx-auto max-w-3xl text-4xl font-bold leading-tight text-white sm:text-6xl">
        A block wins every 60 seconds.
        <br />
        <span className="shimmer">Make the next one yours.</span>
      </h2>
      <p className="rise rise-2 mx-auto mt-5 max-w-md text-base text-mute">
        Connect your wallet, deploy on a block, and settle in seconds. No sign-ups, no custody — you
        hold your keys the whole way.
      </p>
      <div className="rise rise-3 mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <Link
          href={site.links.game}
          onClick={onEnter}
          className="hover-float inline-block rounded-xl bg-lime px-10 py-3.5 text-base font-semibold text-ink shadow-[0_0_40px_-8px_rgba(198,242,78,0.6)] transition-transform hover:scale-[1.03]"
        >
          Enter the Mine ⛏️
        </Link>
        <button
          onClick={onEnter}
          className="rounded-xl px-6 py-3.5 text-sm font-semibold text-mute transition-colors hover:text-white"
        >
          Look around first
        </button>
      </div>
      <p className="rise rise-4 mt-8 text-xs text-mute/60">
        A game of chance, played on-chain. Not available where prohibited.
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
