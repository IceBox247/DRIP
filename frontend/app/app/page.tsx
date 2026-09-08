import Link from "next/link";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { ContractStrip } from "@/components/ContractStrip";
import { site } from "@/lib/site";

// Dashboard SHELL / preview. Live wallet-connect, X OAuth and real points are Phase 2 (need the
// backend). Everything here is a static preview with placeholder values, clearly labeled.

export default function AppDashboard() {
  return (
    <>
      <Nav />
      <ContractStrip />
      <main className="mx-auto max-w-content px-5 py-12">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-white">Your node</h1>
            <p className="mt-1 text-sm text-mute">
              Preview — live data arrives when the app connects to the backend (Phase 2).
            </p>
          </div>
          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-lime/40 bg-lime/10 px-3 py-1 text-xs font-medium text-lime">
            Preview build
          </span>
        </div>

        {/* Connect row */}
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <ConnectCard
            title="Wallet"
            body="Connect your Robinhood Chain wallet to read your DRIP balance and claim rewards."
            cta="Connect wallet"
          />
          <ConnectCard
            title="X account"
            body="Connect X to verify tasks and attribute referrals."
            cta="Connect X"
          />
        </div>

        {/* Node status */}
        <div className="mt-4 rounded-2xl border border-line bg-panel p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="h-2.5 w-2.5 rounded-full bg-mute" />
              <div>
                <div className="font-semibold text-white">Node offline</div>
                <div className="text-xs text-mute">Connect a wallet to switch it on.</div>
              </div>
            </div>
            <button
              type="button"
              disabled
              className="cursor-not-allowed rounded-lg border border-line bg-ink px-4 py-2 text-sm font-semibold text-mute"
            >
              Start node
            </button>
          </div>
        </div>

        {/* Metric cards */}
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
          <Metric label="Hash rate" value="—" sub="base + holdings + boosts" />
          <Metric label="Points this cycle" value="—" sub="streams while node is active" />
          <Metric label="Claimable stock" value="—" sub="settles each cycle" />
        </div>

        {/* Referral */}
        <div className="mt-4 rounded-2xl border border-line bg-panel p-6">
          <h2 className="text-lg font-semibold text-white">Your referral link</h2>
          <p className="mt-1 text-sm text-mute">
            Earn a 10% override on everyone you bring in — it doesn&rsquo;t reduce their earnings.
          </p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <input
              readOnly
              value="Connect to generate your link"
              className="flex-1 rounded-lg border border-line bg-ink px-4 py-2.5 text-sm text-mute"
            />
            <button
              type="button"
              disabled
              className="cursor-not-allowed rounded-lg border border-line bg-ink px-4 py-2.5 text-sm font-semibold text-mute"
            >
              Copy
            </button>
          </div>
        </div>

        <p className="mt-8 text-center text-sm text-mute">
          Want to understand the mechanics first?{" "}
          <Link href="/#rewards" className="text-lime hover:underline">
            See how rewards work
          </Link>
          .
        </p>
      </main>
      <Footer />
    </>
  );
}

function ConnectCard({ title, body, cta }: { title: string; body: string; cta: string }) {
  return (
    <div className="rounded-2xl border border-line bg-panel p-6">
      <h2 className="text-lg font-semibold text-white">{title}</h2>
      <p className="mt-1 text-sm text-mute">{body}</p>
      <button
        type="button"
        disabled
        title="Available in Phase 2"
        className="mt-4 cursor-not-allowed rounded-lg bg-lime/30 px-4 py-2 text-sm font-semibold text-ink/70"
      >
        {cta} · soon
      </button>
    </div>
  );
}

function Metric({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-2xl border border-line bg-panel p-6">
      <div className="text-sm text-mute">{label}</div>
      <div className="mt-2 text-3xl font-semibold text-white">{value}</div>
      <div className="mt-1 text-xs text-mute">{sub}</div>
    </div>
  );
}

export const metadata = {
  title: `App — ${site.name}`,
};
