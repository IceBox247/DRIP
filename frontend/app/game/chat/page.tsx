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

  return (
    <AppChrome>
      <div className="flex h-[calc(100vh-8.5rem)] flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line/60 px-5 py-3">
          <div>
            <h1 className="text-xl font-semibold text-white">Chat</h1>
            <div className="flex items-center gap-1.5 text-xs text-mute">
              <span className={`h-1.5 w-1.5 rounded-full ${live ? "bg-lime" : "bg-mute"}`} />
              {live ? `${online} chatting` : "offline"}
            </div>
          </div>
          <span className="rounded-full border border-line bg-panel px-3 py-1 text-[11px] text-mute">Global</span>
        </div>

        {/* Feed */}
        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {msgs.length === 0 && (
            <div className="mx-auto mt-10 max-w-xs rounded-2xl border border-line bg-panel p-5 text-center text-sm text-mute">
              {live
                ? "No messages yet — say gm to the grid 👋"
                : "Chat is offline. It turns on automatically once a database is connected (set DATABASE_URL in Vercel — a free Neon Postgres works)."}
            </div>
          )}
          {msgs.map((m) => {
            const mine = m.name === myName;
            return m.system ? (
              <div key={m.id} className="mx-auto w-fit rounded-full border border-line bg-panel px-3 py-1 text-center text-[11px] text-mute">
                {m.text}
              </div>
            ) : (
              <div key={m.id} className={`flex gap-2.5 ${mine ? "flex-row-reverse" : ""}`}>
                <span
                  className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-ink"
                  style={{ background: `hsl(${m.hue} 70% 65%)` }}
                >
                  {mine ? "YOU" : initials(m.name)}
                </span>
                <div className={`max-w-[75%] ${mine ? "items-end text-right" : ""} flex flex-col`}>
                  <div className="flex items-center gap-2 text-[11px] text-mute">
                    <span className="font-semibold text-white/90">{mine ? "You" : m.name}</span>
                    <span>{clock(m.ts)}</span>
                  </div>
                  <div
                    className={`mt-1 inline-block rounded-2xl px-3.5 py-2 text-sm ${
                      mine ? "bg-lime text-ink" : "bg-panel text-white"
                    }`}
                  >
                    {m.text}
                  </div>
                </div>
              </div>
            );
          })}
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
            {live
              ? `Posting as ${myName}${address ? " (wallet)" : " · connect a wallet for your address"} · saved`
              : "Chat is offline until a database is connected (DATABASE_URL). Messages you type now aren't saved or shared."}
          </p>
        </div>
      </div>
    </AppChrome>
  );
}
