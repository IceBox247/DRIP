import Link from "next/link";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { GridHero } from "@/components/GridHero";
import { IntroExperience } from "@/components/IntroExperience";
import { site } from "@/lib/site";

// Landing — deliberately minimal (ORE-style): a hero, four one-line steps, and a way in.
// The old passive hash-rate/reserve/referrals model was retired for Grid Mine; keep this lean.

const steps = [
  { n: "01", t: "Deploy miners", d: "Stake USDG on any of the 25 blocks before the dig seals." },
  { n: "02", t: "One block strikes ore", d: "A secure on-chain RNG picks it — 1-in-25. Verifiable, nobody can rig it." },
  { n: "03", t: "Its miners split the haul", d: "The other blocks' USDG flows to the block that struck, pro-rata, in USDG." },
  { n: "04", t: "Buy, burn, refine", d: "A 10% cut buys DRIP — burned, staked, and paid to the miners who struck." },
];

export default function Home() {
  return (
    <>
      <IntroExperience />
      <Nav />
      <main>
        {/* Hero */}
        <section className="relative overflow-hidden hero-glow">
          <div className="pointer-events-none absolute inset-0 grid-bg" aria-hidden="true" />
          <div className="relative mx-auto max-w-content px-5 pb-20 pt-20 sm:pt-28">
            <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
              <div>
                <h1 className="text-5xl font-semibold leading-[1.02] tracking-tight text-white sm:text-6xl">
                  Mine the blocks for
                  <br />
                  <span className="text-lime">USDG &amp; DRIP.</span>
                </h1>

                <p className="mt-6 max-w-md text-lg leading-relaxed text-mute">
                  A new dig every 60 seconds. Stake USDG on the blocks — one strikes ore, and its
                  miners split the haul. Nothing is minted; the team holds zero.
                </p>

                <div className="mt-8 flex items-center gap-5">
                  <Link
                    href={site.links.game}
                    className="inline-block rounded-lg bg-lime px-8 py-3 text-sm font-semibold text-ink transition-transform hover:scale-[1.02] active:scale-100"
                  >
                    Mine
                  </Link>
                  <Link
                    href="/game/more/about#vision"
                    className="text-sm font-semibold text-mute transition-colors hover:text-white"
                  >
                    Read vision
                  </Link>
                </div>

                <p className="mt-5 text-xs text-mute/70">
                  Provably-fair on-chain mining on Robinhood Chain. Demo uses test funds — not
                  launched, not available where prohibited.
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
