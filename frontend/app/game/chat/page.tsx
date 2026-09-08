"use client";

import { useEffect, useRef, useState } from "react";
import { AppChrome } from "@/components/AppChrome";

// Chat — ORE-style live miner chat. Working DEMO: messages post locally and a simulated feed drips
// in new lines so it feels alive. Wallet-gated posting + a real backend (Neon) are Phase 2; for now
// you post as a guest handle. No chain, no persistence.

type Msg = { id: number; name: string; hue: number; text: string; ts: number; you?: boolean; system?: boolean };

const now = () => Date.now();
const HANDLES = ["55nF…mqjh", "7ibJ…PU4B", "NotZohran", "7chh…wC4f", "gridwhale", "5c4R…VHcq", "dripmaxi", "H8VM…66bA"];
const CHATTER = [
  "all in on tile 7 lol",
  "motherlode is at 26 DRIP 👀",
  "who just solo'd that round",
  "spreading across all 25, win small win often",
  "gm miners",
  "refined 4 DRIP, tax hurt but wagmi",
  "that was a fat loser pot",
  "burn ratio is insane, 70% every round",
  "stacking one tile from here on",
  "someone hit the 1/625??",
  "USDG pot always pro-rata, love it",
  "staking apr looking healthy",
];
const hueFor = (name: string) => [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
const initials = (name: string) => name.replace(/[^A-Za-z0-9]/g, "").slice(0, 2).toUpperCase() || "??";

const SEED: Msg[] = [
  { id: 1, name: "system", hue: 0, text: "Welcome to Grid Mine chat — demo build. Be nice, no shilling.", ts: now() - 1000 * 60 * 14, system: true },
  { id: 2, name: "gridwhale", hue: hueFor("gridwhale"), text: "gm, who's mining the early rounds", ts: now() - 1000 * 60 * 12 },
  { id: 3, name: "NotZohran", hue: hueFor("NotZohran"), text: "spread strat > stack strat, fight me", ts: now() - 1000 * 60 * 9 },
  { id: 4, name: "dripmaxi", hue: hueFor("dripmaxi"), text: "just solo'd the DRIP pot 🏆 all 0.63 mine", ts: now() - 1000 * 60 * 6 },
  { id: 5, name: "7ibJ…PU4B", hue: hueFor("7ibJ…PU4B"), text: "motherlode climbing, 1/625 gonna print for someone", ts: now() - 1000 * 60 * 3 },
];

const clock = (ts: number) => {
  const diff = (now() - ts) / 1000;
  if (diff < 60) return "now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  return new Date(ts).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
};

export default function ChatPage() {
  const [msgs, setMsgs] = useState<Msg[]>(SEED);
  const [draft, setDraft] = useState("");
  const [online] = useState(() => 40 + Math.floor(Math.random() * 80));
  const nextId = useRef(SEED.length + 1);
  const endRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Keep the feed pinned to the latest message.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs]);

  // Simulated live chatter so the room feels alive in the demo.
  useEffect(() => {
    const tick = () => {
      const name = HANDLES[Math.floor(Math.random() * HANDLES.length)];
      const text = CHATTER[Math.floor(Math.random() * CHATTER.length)];
      setMsgs((m) => [...m, { id: nextId.current++, name, hue: hueFor(name), text, ts: now() }].slice(-60));
    };
    const loop = () => {
      const id = setTimeout(() => { tick(); schedule(); }, 5000 + Math.random() * 9000);
      timer.current = id;
    };
    const timer = { current: undefined as ReturnType<typeof setTimeout> | undefined };
    const schedule = loop;
    schedule();
    return () => timer.current && clearTimeout(timer.current);
  }, []);

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    setMsgs((m) => [...m, { id: nextId.current++, name: "you", hue: 90, text, ts: now(), you: true }].slice(-60));
    setDraft("");
  };

  return (
    <AppChrome>
      <div className="flex h-[calc(100vh-8.5rem)] flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line/60 px-5 py-3">
          <div>
            <h1 className="text-xl font-semibold text-white">Chat</h1>
            <div className="flex items-center gap-1.5 text-xs text-mute">
              <span className="h-1.5 w-1.5 rounded-full bg-lime" /> {online} miners online
            </div>
          </div>
          <span className="rounded-full border border-line bg-panel px-3 py-1 text-[11px] text-mute">Global</span>
        </div>

        {/* Feed */}
        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {msgs.map((m) =>
            m.system ? (
              <div key={m.id} className="mx-auto w-fit rounded-full border border-line bg-panel px-3 py-1 text-center text-[11px] text-mute">
                {m.text}
              </div>
            ) : (
              <div key={m.id} className={`flex gap-2.5 ${m.you ? "flex-row-reverse" : ""}`}>
                <span
                  className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-ink"
                  style={{ background: `hsl(${m.hue} 70% 65%)` }}
                >
                  {m.you ? "YOU" : initials(m.name)}
                </span>
                <div className={`max-w-[75%] ${m.you ? "items-end text-right" : ""} flex flex-col`}>
                  <div className="flex items-center gap-2 text-[11px] text-mute">
                    <span className="font-semibold text-white/90">{m.you ? "You" : m.name}</span>
                    <span>{clock(m.ts)}</span>
                  </div>
                  <div
                    className={`mt-1 inline-block rounded-2xl px-3.5 py-2 text-sm ${
                      m.you ? "bg-lime text-ink" : "bg-panel text-white"
                    }`}
                  >
                    {m.text}
                  </div>
                </div>
              </div>
            )
          )}
          <div ref={endRef} />
        </div>

        {/* Composer */}
        <div className="border-t border-line/60 bg-ink/90 px-3 py-3">
          <div className="flex items-center gap-2">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder="Message the grid…"
              maxLength={240}
              className="flex-1 rounded-full border border-line bg-panel px-4 py-2.5 text-sm text-white placeholder:text-mute focus:border-mute/60 focus:outline-none"
            />
            <button
              onClick={send}
              disabled={!draft.trim()}
              className="shrink-0 rounded-full bg-lime px-5 py-2.5 text-sm font-semibold text-ink disabled:cursor-not-allowed disabled:bg-panel disabled:text-mute"
            >
              Send
            </button>
          </div>
          <p className="mt-2 text-center text-[11px] text-mute/60">
            Posting as a guest · wallet-gated identity + persistence land in Phase 2
          </p>
        </div>
      </div>
    </AppChrome>
  );
}
