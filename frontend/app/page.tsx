import Link from "next/link";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { GridHero } from "@/components/GridHero";
import { site, stats, steps, faqs } from "@/lib/site";

export default function Home() {
  const live = site.launched;
  return (
    <>
      <Nav />
      <main>
        {/* Hero */}
        <section className="relative overflow-hidden hero-glow">
          <div className="pointer-events-none absolute inset-0 grid-bg" aria-hidden="true" />
          <div className="relative mx-auto max-w-content px-5 pb-16 pt-16 sm:pt-24">
            <div className="grid items-center gap-10 lg:grid-cols-[1.1fr_0.9fr]">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-line bg-panel/60 px-3 py-1 text-xs text-mute">
                  <span className="h-2 w-2 rounded-full bg-lime animate-pulseDot" />
                  {live
                    ? `Live on ${site.chain} · via ${site.launchpad}`
                    : `Pre-launch · fair launch on ${site.chain} · via ${site.launchpad}`}
                </div>

                <h1 className="mt-6 text-5xl font-semibold leading-[1.02] tracking-tight text-white sm:text-6xl">
                  Mine the grid for
                  <br />
                  <span className="text-lime">USDG &amp; DRIP.</span>
                </h1>

                <p className="mt-6 max-w-xl text-lg leading-relaxed text-mute">
                  Every 60 seconds, deploy USDG onto a 5×5 mine. One tile wins — winners split the
                  USDG pot, and the protocol buys DRIP for winners, burns most, and feeds stakers.
                  Nothing is minted; the team holds zero tokens.
                </p>

                <div className="mt-8 flex flex-wrap items-center gap-3">
                  <Link
                    href={site.links.game}
                    className="rounded-lg bg-lime px-5 py-3 text-sm font-semibold text-ink transition-transform hover:scale-[1.02] active:scale-100"
                  >
                    Play Grid Mine
                  </Link>
                  <a
                    href={site.links.spec}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg border border-line bg-panel/60 px-5 py-3 text-sm font-semibold text-white transition-colors hover:border-mute/50"
                  >
                    Read the spec
                  </a>
                </div>

                <p className="mt-4 text-xs text-mute/70">
                  A game of chance, played on-chain. Demo is simulated with fake funds — not launched,
                  not available where prohibited.
                </p>
              </div>

              {/* Live-looking mine */}
              <GridHero />
            </div>

            {/* Stat row */}
            <div className="mt-14 grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-3">
              {stats.map((s) => (
                <div key={s.label} className="bg-panel px-6 py-7">
                  <div className="text-4xl font-semibold text-white">{s.value}</div>
                  <div className="mt-1 text-sm font-medium text-lime">{s.label}</div>
                  <div className="mt-1 text-xs text-mute">{s.note}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Grid Mine — the main tech */}
        <Section id="grid" eyebrow="Grid Mine · the core game" title="A round every minute">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[
              { n: "01", title: "Deploy", body: "Stake USDG onto any of the 25 tiles before the 60-second round closes. Spread wide or stack one." },
              { n: "02", title: "One tile wins", body: "A secure on-chain RNG picks the winning tile — 1-in-25. Nobody, not even the team, can pick it." },
              { n: "03", title: "Winners split + earn DRIP", body: "Losers' USDG goes to the winning tile (pro-rata). The 10% cut buys DRIP — winners get a share; the rest burns and feeds stakers. Nothing is minted." },
              { n: "04", title: "Buyback + refine", body: "Most of the bought DRIP is burned; a slice grows the motherlode. Claim your DRIP anytime — waiting earns you others' 10% refine tax." },
            ].map((s) => (
              <div key={s.n} className="rounded-2xl border border-line bg-panel p-6 transition-colors hover:border-mute/40">
                <div className="text-sm font-semibold text-lime">{s.n}</div>
                <h3 className="mt-3 text-lg font-semibold text-white">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-mute">{s.body}</p>
              </div>
            ))}
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link href={site.links.game} className="rounded-lg bg-lime px-5 py-3 text-sm font-semibold text-ink transition-transform hover:scale-[1.02]">
              Play Grid Mine
            </Link>
            <span className="text-xs text-mute">
              +0.2 DRIP jackpot builds every round · 1-in-625 chance it dumps on the winning tile 🎰
            </span>
          </div>
        </Section>

        {/* Passive engine — the complement */}
        <Section id="how" eyebrow="The other engine · passive" title="Or just hold, and earn stock">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            {steps.map((s) => (
              <div
                key={s.n}
                className="rounded-2xl border border-line bg-panel p-6 transition-colors hover:border-mute/40"
              >
                <div className="text-sm font-semibold text-lime">{s.n}</div>
                <h3 className="mt-3 text-lg font-semibold text-white">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-mute">{s.body}</p>
              </div>
            ))}
          </div>
        </Section>

        {/* Rewards: hash rate + reserve engine */}
        <Section
          id="rewards"
          eyebrow="Rewards engine"
          title="Built so it keeps paying — and whales can't vacuum it"
        >
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-line bg-panel p-7">
              <h3 className="text-lg font-semibold text-white">Your hash rate</h3>
              <p className="mt-2 text-sm text-mute">
                Points stream in per second while your node is active. Your rate is:
              </p>
              <pre className="mt-4 overflow-x-auto rounded-xl border border-line bg-ink p-4 text-[13px] leading-relaxed text-white">
                <code>
                  {`hash_rate = base
          + (drip_held ^ 0.75) × k
          + task_boosts
          + referral_boosts`}
                </code>
              </pre>
              <ul className="mt-4 space-y-2 text-sm text-mute">
                <li>
                  <span className="text-white">Sub-linear holdings.</span> The 0.75 exponent means
                  big holders earn more, but not proportionally more.
                </li>
                <li>
                  <span className="text-white">Everyone mines.</span> A base rate keeps even
                  zero-balance nodes earning a little.
                </li>
                <li>
                  <span className="text-white">Stream, not snapshot.</span> Points accrue over time —
                  no last-second loading up before a claim.
                </li>
              </ul>
            </div>

            <div className="rounded-2xl border border-line bg-panel p-7">
              <h3 className="text-lg font-semibold text-white">The reserve engine</h3>
              <p className="mt-2 text-sm text-mute">
                Each cycle, stock bought with fee revenue is split 50/50 — half distributed, half to
                a reserve. On quiet days the reserve keeps payouts flowing.
              </p>
              <div className="mt-4 overflow-hidden rounded-xl border border-line">
                <div className="grid grid-cols-2 bg-panel2 px-4 py-2 text-xs font-medium uppercase tracking-wide text-mute">
                  <span>Reserve health</span>
                  <span className="text-right">Draw / cycle</span>
                </div>
                {[
                  ["High (&gt; 60% of peak)", "2%"],
                  ["Medium", "3–4%"],
                  ["Low (&lt; 20% of peak)", "5%"],
                ].map(([k, v]) => (
                  <div
                    key={k}
                    className="grid grid-cols-2 border-t border-line px-4 py-3 text-sm"
                  >
                    <span className="text-mute" dangerouslySetInnerHTML={{ __html: k }} />
                    <span className="text-right font-semibold text-white">{v}</span>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-sm text-mute">
                High reserve → drip slowly. Low reserve → release faster to stay engaging without
                emptying it.
              </p>
            </div>
          </div>
        </Section>

        {/* Referrals + Tasks */}
        <Section id="referrals" eyebrow="Grow faster" title="Referrals & tasks">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-line bg-panel p-7">
              <h3 className="text-lg font-semibold text-white">Referrals</h3>
              <p className="mt-3 text-sm leading-relaxed text-mute">
                Every user gets a unique link. When someone you refer connects and starts earning,
                you get an override on their earnings — an affiliate bonus that{" "}
                <span className="text-white">does not reduce what your friend earns.</span>
              </p>
              <div className="mt-5 inline-flex items-baseline gap-2 rounded-lg border border-line bg-ink px-4 py-3">
                <span className="text-2xl font-semibold text-lime">10%</span>
                <span className="text-sm text-mute">referral override (default)</span>
              </div>
            </div>

            <div className="rounded-2xl border border-line bg-panel p-7">
              <h3 className="text-lg font-semibold text-white">Tasks</h3>
              <p className="mt-3 text-sm leading-relaxed text-mute">
                Complete simple social tasks — follow, repost, comment — to add temporary boosts to
                your hash rate. More engagement, more points.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                {["Follow", "Repost", "Comment", "Invite"].map((t) => (
                  <span
                    key={t}
                    className="rounded-full border border-line bg-ink px-3 py-1 text-xs text-mute"
                  >
                    + boost · {t}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </Section>

        {/* Fee flow */}
        <Section eyebrow="Where rewards come from" title="Fees in, stock out">
          <div className="rounded-2xl border border-line bg-panel p-7">
            <ol className="flex flex-col gap-4 md:flex-row md:items-stretch md:gap-0">
              {[
                { t: "Trade fee", d: `${site.launchpad} collects the fee on DRIP trades and pays our creator share in USDG.` },
                { t: "Auto-buy", d: "Most of that USDG is swapped into tokenized Stock Tokens each cycle." },
                { t: "Split", d: "50% to the reserve, 50% to this cycle's distribution pool." },
                { t: "Claim", d: "Distributed to active miners by points earned. You claim your share." },
              ].map((s, i, arr) => (
                <li key={s.t} className="flex-1 md:px-5 md:first:pl-0 md:last:pr-0">
                  <div className="flex items-center gap-3 md:flex-col md:items-start">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-lime/40 bg-lime/10 text-sm font-semibold text-lime">
                      {i + 1}
                    </span>
                    <h4 className="text-base font-semibold text-white md:mt-3">{s.t}</h4>
                  </div>
                  <p className="mt-2 text-sm text-mute">{s.d}</p>
                  {i < arr.length - 1 && (
                    <div className="my-4 hidden h-px w-full bg-line md:block" />
                  )}
                </li>
              ))}
            </ol>
          </div>
        </Section>

        {/* FAQ */}
        <Section id="faq" eyebrow="Questions" title="Good to know">
          <div className="mx-auto max-w-3xl divide-y divide-line rounded-2xl border border-line bg-panel">
            {faqs.map((f) => (
              <details key={f.q} className="group px-6 py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-medium text-white">
                  {f.q}
                  <span className="text-mute transition-transform group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-mute">{f.a}</p>
              </details>
            ))}
          </div>
        </Section>

        {/* CTA */}
        <section className="mx-auto max-w-content px-5 py-16">
          <div className="hero-glow relative overflow-hidden rounded-3xl border border-line bg-panel p-10 text-center sm:p-16">
            <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-5xl">
              {live ? "Turn on your node." : "Be ready at launch."}
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-mute">
              {live
                ? "Connect a wallet and your X account to start earning hash rate toward tokenized-stock rewards."
                : "Drip isn’t live yet. Explore the preview and read the spec so you understand exactly how it works before launch."}
            </p>
            <div className="mt-8 flex justify-center gap-3">
              <Link
                href={site.links.app}
                className="rounded-lg bg-lime px-6 py-3 text-sm font-semibold text-ink transition-transform hover:scale-[1.02] active:scale-100"
              >
                {live ? "Launch app" : "Preview the app"}
              </Link>
              {!live && (
                <a
                  href={site.links.x}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg border border-line bg-ink px-6 py-3 text-sm font-semibold text-white transition-colors hover:border-mute/50"
                >
                  Follow for launch
                </a>
              )}
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}

function Section({
  id,
  eyebrow,
  title,
  children,
}: {
  id?: string;
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="mx-auto max-w-content scroll-mt-20 px-5 py-16">
      <div className="mb-8">
        <div className="text-sm font-semibold text-lime">{eyebrow}</div>
        <h2 className="mt-2 max-w-2xl text-3xl font-semibold tracking-tight text-white sm:text-4xl">
          {title}
        </h2>
      </div>
      {children}
    </section>
  );
}
