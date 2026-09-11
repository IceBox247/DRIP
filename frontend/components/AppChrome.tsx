"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { Logo } from "./Logo";
import { site } from "@/lib/site";

// ORE-style app chrome: compact top bar + bottom tab bar. Wraps the Mine/Stake/etc. app screens.

const tabs = [
  { href: "/game", label: "Mine", icon: GridIcon },
  { href: "/game/stake", label: "Stake", icon: StackIcon },
  { href: "/game/trade", label: "Trade", icon: SwapIcon },
  { href: "/game/chat", label: "Chat", icon: ChatIcon },
  { href: "/game/more", label: "More", icon: MoreIcon },
];

export function AppChrome({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col">
      {/* Top bar */}
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-line/60 bg-ink/85 px-4 py-3 backdrop-blur">
        <Link href="/" className="flex items-center gap-2">
          <Logo className="text-white" />
        </Link>
        <div className="flex items-center gap-3">
          <a href={site.links.x} target="_blank" rel="noreferrer" className="text-mute hover:text-white" aria-label="X">
            <XIcon />
          </a>
          <ConnectButton />
        </div>
      </header>

      <main className="flex-1 pb-20">{children}</main>

      {/* Bottom tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-md border-t border-line/60 bg-ink/95 backdrop-blur">
        <div className="grid grid-cols-5">
          {tabs.map((t) => {
            const active = path === t.href;
            const Icon = t.icon;
            return (
              <Link
                key={t.href}
                href={t.href}
                className={`flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium ${active ? "text-white" : "text-mute"}`}
              >
                <Icon active={active} />
                {t.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

function GridIcon({ active }: { active?: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      {[0, 1].flatMap((r) => [0, 1].map((c) => (
        <rect key={`${r}-${c}`} x={2 + c * 9} y={2 + r * 9} width="7" height="7" rx="1.5" fill={active ? "#c6f24e" : "currentColor"} />
      )))}
    </svg>
  );
}
function StackIcon({ active }: { active?: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke={active ? "#c6f24e" : "currentColor"} strokeWidth="1.6">
      <ellipse cx="10" cy="5" rx="7" ry="2.5" /><path d="M3 5v5c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V5" /><path d="M3 10v5c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-5" />
    </svg>
  );
}
function SwapIcon({ active }: { active?: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke={active ? "#c6f24e" : "currentColor"} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7h11l-3-3M16 13H5l3 3" />
    </svg>
  );
}
function ChatIcon({ active }: { active?: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill={active ? "#c6f24e" : "currentColor"}>
      <path d="M3 4h14a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H8l-4 3v-3H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" />
    </svg>
  );
}
function MoreIcon({ active }: { active?: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" stroke={active ? "#c6f24e" : "currentColor"} strokeWidth="1.8" strokeLinecap="round">
      <path d="M3 6h14M3 10h14M3 14h14" />
    </svg>
  );
}
const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;

// Real wallet connect (wagmi). Opens a small picker of available wallets. On mobile, browser wallets
// (injected) usually aren't present — WalletConnect covers those, and it's only offered when
// NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is set. Errors are shown instead of failing silently.
function ConnectButton() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending, error } = useConnect();
  const { disconnect } = useDisconnect();
  const [open, setOpen] = useState(false);

  if (isConnected && address) {
    return (
      <button
        type="button"
        onClick={() => disconnect()}
        title="Click to disconnect"
        className="rounded-full border border-line bg-panel px-4 py-1.5 text-sm font-semibold text-white"
      >
        {short(address)}
      </button>
    );
  }

  const hasInjected = typeof window !== "undefined" && !!(window as unknown as { ethereum?: unknown }).ethereum;
  const label = (c: { id: string; name: string }) =>
    c.id === "walletConnect" ? "WalletConnect (mobile)" : c.name === "Injected" ? (hasInjected ? "Browser wallet" : "Browser wallet (none found)") : c.name;

  return (
    <div className="relative">
      <button
        type="button"
        disabled={isPending}
        onClick={() => setOpen((o) => !o)}
        className="rounded-full bg-white/90 px-4 py-1.5 text-sm font-semibold text-ink disabled:opacity-60"
      >
        {isPending ? "Connecting…" : "Connect"}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-2 w-60 rounded-2xl border border-line bg-panel p-2 shadow-xl">
            <div className="px-2 py-1 text-[11px] uppercase tracking-wide text-mute">Connect a wallet</div>
            {connectors.map((c) => (
              <button
                key={c.uid}
                onClick={() => { connect({ connector: c }); setOpen(false); }}
                className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm font-medium text-white hover:bg-panel2"
              >
                {label(c)}
              </button>
            ))}
            {!connectors.some((c) => c.id === "walletConnect") && (
              <div className="px-3 py-2 text-[11px] leading-relaxed text-mute">
                On a phone browser? Set <span className="text-white">NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID</span> in
                Vercel to connect a mobile wallet, or open this site inside your wallet app&rsquo;s browser.
              </div>
            )}
            {error && <div className="px-3 py-2 text-[11px] text-red-400">{error.message}</div>}
          </div>
        </>
      )}
    </div>
  );
}

function XIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M18.9 2h3.3l-7.2 8.3L23.5 22h-6.6l-5.2-6.8L5.8 22H2.5l7.7-8.9L1.5 2h6.8l4.7 6.2L18.9 2zm-1.2 18h1.8L7.4 3.8H5.5L17.7 20z" /></svg>
  );
}
