"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
          <a href={site.links.github} target="_blank" rel="noreferrer" className="text-mute hover:text-white" aria-label="GitHub">
            <GithubIcon />
          </a>
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

// Real wallet connect (wagmi). Connects the first available connector (injected/WalletConnect);
// when none is available it stays a no-op label. Full deploy/harvest wiring comes once addresses
// are configured — see lib/contracts.ts.
function ConnectButton() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();

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
  return (
    <button
      type="button"
      disabled={isPending || connectors.length === 0}
      onClick={() => connectors[0] && connect({ connector: connectors[0] })}
      className="rounded-full bg-white/90 px-4 py-1.5 text-sm font-semibold text-ink disabled:opacity-60"
    >
      {isPending ? "Connecting…" : "Connect"}
    </button>
  );
}

function GithubIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.58 2 12.26c0 4.5 2.87 8.32 6.84 9.67.5.1.68-.22.68-.49v-1.7c-2.78.62-3.37-1.37-3.37-1.37-.46-1.18-1.11-1.5-1.11-1.5-.9-.63.07-.62.07-.62 1 .07 1.53 1.05 1.53 1.05.89 1.56 2.34 1.11 2.91.85.09-.66.35-1.11.63-1.36-2.22-.26-4.56-1.14-4.56-5.07 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.7 0 0 .84-.28 2.75 1.05a9.4 9.4 0 0 1 5 0c1.91-1.33 2.75-1.05 2.75-1.05.55 1.4.2 2.44.1 2.7.64.72 1.03 1.63 1.03 2.75 0 3.94-2.34 4.8-4.57 5.06.36.32.68.94.68 1.9v2.82c0 .27.18.6.69.49A10.03 10.03 0 0 0 22 12.26C22 6.58 17.52 2 12 2z" /></svg>
  );
}
function XIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M18.9 2h3.3l-7.2 8.3L23.5 22h-6.6l-5.2-6.8L5.8 22H2.5l7.7-8.9L1.5 2h6.8l4.7 6.2L18.9 2zm-1.2 18h1.8L7.4 3.8H5.5L17.7 20z" /></svg>
  );
}
