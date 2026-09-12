"use client";

import { useEffect, useRef, useState } from "react";
import { useAccount } from "wagmi";
import { AppChrome } from "@/components/AppChrome";

// Chat — ORE-style live miner chat. REAL messages persisted to Neon Postgres via /api/chat when
// DATABASE_URL is set. No demo chatter: until a database is connected the feed shows an offline
// notice rather than fabricated conversation. Each browser gets its own guest handle (stored locally)
// until a wallet is connected, so different people show as different senders — not all as "you".

type Msg = { id: number; name: string; hue: number; text: string; ts: number; system?: boolean };
const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;

const now = () => Date.now();
const hueFor = (name: string) => [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
const initials = (name: string) => name.replace(/[^A-Za-z0-9]/g, "").slice(0, 2).toUpperCase() || "??";

const clock = (ts: number) => {
  const diff = (now() - ts) / 1000;
  if (diff < 60) return "now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  return new Date(ts).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
};

type Row = { id: number; name: string; hue: number; body: string; created_at: string };
const rowToMsg = (r: Row): Msg => ({ id: r.id, name: r.name, hue: r.hue, text: r.body, ts: Date.parse(r.created_at) });

export default function ChatPage() {
  const { address } = useAccount();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [live, setLive] = useState(false); // true once the Neon-backed API answers
  // Per-browser guest identity (persists across reloads). A connected wallet overrides it.
  const [guest] = useState(() => {
    try {
      const k = "drip_chat_handle";
      let v = localStorage.getItem(k);
      if (!v) { v = `guest-${Math.random().toString(16).slice(2, 6)}`; localStorage.setItem(k, v); }
      return v;
    } catch { return `guest-${Math.random().toString(16).slice(2, 6)}`; }
  });
  const myName = address ? short(address) : guest;
  const nextId = useRef(-1); // negative temp ids for optimistic local messages (server ids are positive)
  const endRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const online = new Set(msgs.filter((m) => !m.system).map((m) => m.name)).size; // real: distinct chatters in view

  // Keep the feed pinned to the latest message.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs]);

  // On mount, ask the API whether a database is wired. If so, go live; else stay in demo.
  useEffect(() => {
    let alive = true;
    fetch("/api/chat")
      .then((r) => r.json())
      .then((d) => {
        if (!alive || !d?.enabled) return;
        setLive(true);
        if (Array.isArray(d.messages)) setMsgs(d.messages.map(rowToMsg));
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  // Live mode: poll the API for new messages. When there's no database, we DON'T simulate fake chatter
  // — the feed just stays as-is (the offline notice is shown below the composer).
  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => {
      fetch("/api/chat")
        .then((r) => r.json())
        .then((d) => { if (d?.enabled && Array.isArray(d.messages)) setMsgs(d.messages.map(rowToMsg)); })
        .catch(() => {});
    }, 5000);
    return () => clearInterval(id);
  }, [live]);

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    const mine: Msg = { id: nextId.current++, name: myName, hue: hueFor(myName), text, ts: now() };
    if (live) {
      // Optimistic append; the next poll reconciles with the server copy.
      setMsgs((m) => [...m, mine].slice(-60));
      fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: myName, body: text, addr: address ?? null }),
      }).catch(() => {});
    } else {
      setMsgs((m) => [...m, mine].slice(-60));
    }
  };

  // Distinct recent chatters → little avatar stack in the header.
  const recentPeople = Array.from(
    msgs.filter((m) => !m.system).reduce((map, m) => map.set(m.name, m.hue), new Map<string, number>()),
  ).slice(-5);

  // Group consecutive messages from the same sender so the feed reads as threaded, not a wall of avatars.
  const groups: { key: string; name: string; hue: number; mine: boolean; items: Msg[] }[] = [];
  for (const m of msgs) {
    if (m.system) { groups.push({ key: `sys-${m.id}`, name: "", hue: 0, mine: false, items: [m] }); continue; }
    const last = groups[groups.length - 1];
    const mine = m.name === myName;
    if (last && !last.items[0].system && last.name === m.name && m.ts - last.items[last.items.length - 1].ts < 4 * 60_000) {
      last.items.push(m);
    } else {
      groups.push({ key: `g-${m.id}`, name: m.name, hue: m.hue, mine, items: [m] });
    }
  }

  return (
    <AppChrome>
      <div className="flex h-[calc(100vh-8.5rem)] flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line/60 bg-gradient-to-b from-panel/50 to-transparent px-5 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-lime/15 text-base">💬</div>
            <div>
              <h1 className="text-base font-semibold leading-tight text-white">Block Chat</h1>
              <div className="flex items-center gap-1.5 text-[11px] text-mute">
                <span className={`h-1.5 w-1.5 rounded-full ${live ? "bg-lime shadow-[0_0_6px_rgba(198,242,78,0.8)]" : "bg-mute"}`} />
                {live ? `${online} online` : "offline"}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {recentPeople.length > 0 && (
              <div className="flex items-center">
                {recentPeople.map(([name, hue], i) => (
                  <span
                    key={name}
                    style={{ background: `hsl(${hue} 65% 60%)`, marginLeft: i === 0 ? 0 : -8, zIndex: recentPeople.length - i }}
                    className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-ink text-[9px] font-bold text-ink"
                  >
                    {initials(name)}
                  </span>
                ))}
              </div>
            )}
            <span className="rounded-full border border-line bg-panel px-3 py-1 text-[11px] font-medium text-mute">🌐 Global</span>
          </div>
        </div>

        {/* Feed */}
        <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-5">
          {msgs.length === 0 && (
            <div className="mx-auto mt-12 max-w-xs rounded-2xl border border-line bg-panel/60 p-6 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-lime/10 text-2xl">👋</div>
              <p className="text-sm leading-relaxed text-mute">
                {live
                  ? "Quiet in here. Say gm to the block and get the room going."
                  : "Chat is offline. It turns on the moment a database is connected (set DATABASE_URL in Vercel — a free Neon Postgres works)."}
              </p>
            </div>
          )}

          {groups.map((g) => {
            if (g.items[0].system) {
              return (
                <div key={g.key} className="mx-auto w-fit rounded-full border border-line bg-panel/70 px-3 py-1 text-center text-[11px] text-mute">
                  {g.items[0].text}
                </div>
              );
            }
            const { mine } = g;
            return (
              <div key={g.key} className={`flex items-end gap-2.5 ${mine ? "flex-row-reverse" : ""}`}>
                <span
                  className="mb-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-ink ring-2 ring-ink"
                  style={{ background: `hsl(${g.hue} 68% 62%)` }}
                  title={mine ? "You" : g.name}
                >
                  {mine ? "YOU" : initials(g.name)}
                </span>
                <div className={`flex min-w-0 max-w-[76%] flex-col gap-1 ${mine ? "items-end" : "items-start"}`}>
                  <div className={`flex items-center gap-2 px-1 text-[11px] text-mute ${mine ? "flex-row-reverse" : ""}`}>
                    <span className="font-semibold text-white/90">{mine ? "You" : g.name}</span>
                    <span className="text-mute/70">{clock(g.items[g.items.length - 1].ts)}</span>
                  </div>
                  {g.items.map((m, idx) => {
                    // Bubble corner tucks toward the avatar on the first bubble of a group.
                    const tight = mine
                      ? idx === 0 ? "rounded-2xl rounded-br-md" : "rounded-2xl"
                      : idx === 0 ? "rounded-2xl rounded-bl-md" : "rounded-2xl";
                    return (
                      <div
                        key={m.id}
                        className={`inline-block max-w-full break-words px-3.5 py-2 text-sm shadow-sm ${tight} ${
                          mine ? "bg-lime text-ink" : "border border-line/70 bg-panel text-white"
                        }`}
                      >
                        {m.text}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
          <div ref={endRef} />
        </div>

        {/* Composer */}
        <div className="border-t border-line/60 bg-ink/95 px-3 py-3 backdrop-blur">
          <div className="flex items-end gap-2 rounded-2xl border border-line bg-panel px-2 py-1.5 focus-within:border-mute/60">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder="Message the block…"
              maxLength={240}
              className="min-w-0 flex-1 bg-transparent px-2.5 py-1.5 text-sm text-white placeholder:text-mute focus:outline-none"
            />
            {draft.length > 0 && <span className="pb-1 text-[10px] tabular-nums text-mute/60">{draft.length}/240</span>}
            <button
              onClick={send}
              disabled={!draft.trim()}
              aria-label="Send"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-lime text-ink transition-transform hover:scale-105 disabled:cursor-not-allowed disabled:bg-panel2 disabled:text-mute disabled:hover:scale-100"
            >
              <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 10l14-6-6 14-2-6-6-2z" />
              </svg>
            </button>
          </div>
          <p className="mt-2 text-center text-[11px] text-mute/60">
            {live
              ? `Posting as ${myName}${address ? " · wallet" : " · connect a wallet for your address"} · saved on-chain-adjacent`
              : "Offline until a database is connected — messages you type now aren't saved or shared."}
          </p>
        </div>
      </div>
    </AppChrome>
  );
}
