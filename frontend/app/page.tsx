import Link from "next/link";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { GridHero } from "@/components/GridHero";
import { site } from "@/lib/site";

// Landing — deliberately minimal (ORE-style): a hero, four one-line steps, and a way in.
// The old passive hash-rate/reserve/referrals model was retired for Grid Mine; keep this lean.

const steps = [
  { n: "01", t: "Deploy", d: "Stake USDG onto any of the 25 tiles before the round closes." },
  { n: "02", t: "One tile wins", d: "A secure on-chain RNG picks it — 1-in-25. Nobody can rig it." },
  { n: "03", t: "Winners split the pot", d: "Losers' USDG goes to the winning tile, pro-rata, in USDG." },
  { n: "04", t: "Buy, burn, refine", d: "A 10% cut buys DRIP — burned, staked, and paid to winners." },
];

export default function Home() {
  return (
    <>
      <Nav />
      <main>
        {/* Hero */}
        <section className="relative overflow-hidden hero-glow">
          <div className="pointer-events-none absolute inset-0 grid-bg" aria-hidden="true" />
          <div className="relative mx-auto max-w-content px-5 pb-20 pt-20 sm:pt-28">
            <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
              <div>
                <h1 className="text-5xl font-semibold leading-[1.02] tracking-tight text-white sm:text-6xl">
                  Mine the grid for
                  <br />
                  <span className="text-lime">USDG &amp; DRIP.</span>
                </h1>

                <p className="mt-6 max-w-md text-lg leading-relaxed text-mute">
                  A round every 60 seconds. One tile wins. Nothing is minted, the team holds zero.
                </p>

                <div className="mt-8">
                  <Link
                    href={site.links.game}
                    className="inline-block rounded-lg bg-lime px-8 py-3 text-sm font-semibold text-ink transition-transform hover:scale-[1.02] active:scale-100"
                  >
                    Mine
                  </Link>
                </div>

                <p className="mt-5 text-xs text-mute/70">
                  A game of chance, played on-chain. Demo uses fake funds — not launched, not
                  available where prohibited.
                </p>
              </div>

              {/* Live-looking mine */}
              <GridHero />
            </div>
          </div>
        </section>

        {/* How a round works — quiet, one line each */}
        <section className="mx-auto max-w-content px-5 pb-24">
          <div className="grid grid-cols-1 gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((s) => (
              <div key={s.n}>
                <div className="text-sm font-semibold text-lime">{s.n}</div>
                <h3 className="mt-2 text-base font-semibold text-white">{s.t}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-mute">{s.d}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
