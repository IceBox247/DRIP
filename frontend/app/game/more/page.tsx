"use client";

import Link from "next/link";
import { AppChrome } from "@/components/AppChrome";
import { site } from "@/lib/site";

// More — ORE-style menu. Six destinations (About, Changelog, Explore, Reserve, Rewards, Shield) plus
// external links. Explore is a full stats screen; the rest are info pages.

type Item = { href: string; label: string; desc: string; icon: React.ReactNode; external?: boolean };

const items: Item[] = [
  { href: "/game/explore", label: "Explore", desc: "Market, mining, staking, supply & leaderboards", icon: <ChartIcon /> },
  { href: "/game/more/rewards", label: "Rewards", desc: "Where each round's DRIP goes", icon: <GiftIcon /> },
  { href: "/game/more/reserve", label: "Reserve", desc: "Motherlode & buyback pools", icon: <VaultIcon /> },
  { href: "/game/more/shield", label: "Shield", desc: "Fair-play & anti-manipulation", icon: <ShieldIcon /> },
  { href: "/game/more/about", label: "About", desc: "What Block Mine is and how it works", icon: <InfoIcon /> },
  { href: "/game/more/changelog", label: "Changelog", desc: "What's shipped and what's next", icon: <ListIcon /> },
];

const external: Item[] = [
  { href: site.links.x, label: "X / Twitter", desc: "Follow for launch updates", icon: <XIcon />, external: true },
];

export default function MorePage() {
  return (
    <AppChrome>
      <div className="px-5 pt-6">
        <h1 className="text-3xl font-semibold tracking-tight text-white">More</h1>
        <p className="mt-1 text-sm text-mute">Everything around the block.</p>

        <div className="mt-6 space-y-2">{items.map((it) => <MenuRow key={it.href} {...it} />)}</div>

        <div className="mt-8 text-xs uppercase tracking-wide text-mute">Off-app</div>
        <div className="mt-2 space-y-2">{external.map((it) => <MenuRow key={it.href} {...it} />)}</div>

        <p className="mt-8 text-center text-[11px] text-mute/60">
          Drip on {site.chain} · pre-launch demo. Provably-fair, chance-based mining; not available where prohibited.
        </p>
      </div>
    </AppChrome>
  );
}

function MenuRow({ href, label, desc, icon, external }: Item) {
  const inner = (
    <div className="flex items-center gap-3 rounded-2xl border border-line bg-panel px-4 py-3.5 transition-colors hover:border-mute/50">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-panel2 text-lime">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-white">{label}</span>
        <span className="block truncate text-xs text-mute">{desc}</span>
      </span>
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-mute">
        {external ? <path d="M7 13l6-6M8 7h5v5" /> : <path d="M8 5l5 5-5 5" />}
      </svg>
    </div>
  );
  return external ? (
    <a href={href} target="_blank" rel="noreferrer">{inner}</a>
  ) : (
    <Link href={href}>{inner}</Link>
  );
}

/* icons */
function ChartIcon() { return <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M3 17V3M3 17h14M7 14V9M11 14V6M15 14v-3" /></svg>; }
function GiftIcon() { return <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="3" y="8" width="14" height="9" rx="1.5" /><path d="M3 11h14M10 8v9M10 8S8.5 3 6.5 4.5 8.5 8 10 8zM10 8s1.5-5 3.5-3.5S11.5 8 10 8z" /></svg>; }
function VaultIcon() { return <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="3" y="4" width="14" height="12" rx="2" /><circle cx="10" cy="10" r="3" /><path d="M10 7v-1M10 14v1" /></svg>; }
function ShieldIcon() { return <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"><path d="M10 3l6 2v4c0 4-3 6-6 8-3-2-6-4-6-8V5l6-2z" /><path d="M7.5 10l2 2 3.5-4" strokeLinecap="round" /></svg>; }
function InfoIcon() { return <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="10" cy="10" r="7" /><path d="M10 9v4M10 6.5v.5" strokeLinecap="round" /></svg>; }
function ListIcon() { return <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M7 6h9M7 10h9M7 14h9M4 6h.01M4 10h.01M4 14h.01" /></svg>; }
function XIcon() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M18.9 2h3.3l-7.2 8.3L23.5 22h-6.6l-5.2-6.8L5.8 22H2.5l7.7-8.9L1.5 2h6.8l4.7 6.2L18.9 2z" /></svg>; }
