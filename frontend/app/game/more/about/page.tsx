import Link from "next/link";
import { MorePage } from "@/components/MorePage";
import { site, gridMine } from "@/lib/site";

// About — the full protocol doc (ORE-style: Intro, Vision, Mining, Staking, Tokenomics, Links).
export const metadata = { title: "About — Drip" };

const burn = gridMine.cutSplitBurnBps / 100;
const stakers = gridMine.cutSplitStakersBps / 100;
const winners = gridMine.cutSplitWinnersBps / 100;
const winnersNvda = gridMine.cutSplitWinnersNvdaBps / 100;
const mother = gridMine.cutSplitMotherlodeBps / 100;

export default function AboutPage() {
  return (
    <MorePage title="About" subtitle="Learn about the protocol.">
      <div className="space-y-10 text-sm leading-relaxed text-mute">
        <Section id="intro" title="Intro">
          <p>
            <span className="text-white">{site.ticker}</span> is a fair-launch token and on-chain game
            on <span className="text-white">{site.chain}</span>, launched via the{" "}
            <span className="text-white">{site.launchpad}</span> launchpad. Its core loop, Block Mine, is
            adapted from ORE: a fast 5×5 game where players deploy USDG onto blocks and the losing stake is
            redistributed to the winners every round.
          </p>
        </Section>

        <Section id="vision" title="Vision">
          <p>
            Most token games either mint endlessly until the chart bleeds out, or hand a cut to a team that
            never had skin in the game. Drip does neither. The team holds <span className="text-white">zero</span>{" "}
            tokens, and DRIP is <span className="text-white">fixed-supply — never minted.</span>
          </p>
          <p className="mt-3">
            Every reward is <span className="text-white">bought</span> from the open market with the protocol
            cut, so each round is real buy pressure, and most of what&rsquo;s bought is burned. The result is a
            game whose economics get tighter the more it&rsquo;s played — a monetary sink dressed as a minute-long
            game, on a chain built for real assets.
          </p>
        </Section>

        <Section id="mining" title="Mining">
          <p>Mining is how you play — and how value moves each round.</p>
          <h3 className="mt-4 text-base font-semibold text-white">How it works</h3>
          <p className="mt-1.5">
            Each round, miners have {gridMine.roundSeconds} seconds to deploy USDG onto blocks of a 5×5 board. At
            the close, a secure on-chain RNG picks one winning block ({`1 / ${gridMine.tiles}`}). All USDG on the
            losing blocks is split among the winners in proportion to their stake on the winning block. A flat{" "}
            {gridMine.adminFeeBps / 100}% entry fee is skimmed at deploy, before funds enter the pool, so it never
            touches the win/loss math.
          </p>
          <h3 className="mt-4 text-base font-semibold text-white">1-or-all</h3>
          <p className="mt-1.5">
            The USDG pot is always pro-rata. The round&rsquo;s DRIP flips a coin: half the time one weighted winner
            takes it all; half the time everyone on the block shares.
          </p>
          <h3 className="mt-4 text-base font-semibold text-white">Motherlode</h3>
          <p className="mt-1.5">
            Each round, a slice of the cut grows the motherlode. On a {`1 / ${gridMine.motherlodeOdds}`} hit, the
            whole jackpot dumps onto that round&rsquo;s winners; otherwise it keeps accumulating.
          </p>
          <h3 className="mt-4 text-base font-semibold text-white">Refining</h3>
          <p className="mt-1.5">
            A {gridMine.refineFeeBps / 100}% refining fee applies to DRIP rewards when claimed, redistributed to
            holders who haven&rsquo;t claimed yet. The longer you hold unrefined DRIP, the more you collect — value
            flows to longer-term holders.
          </p>
        </Section>

        <Section id="staking" title="Staking">
          <p>DRIP holders can stake to earn yield from protocol revenue.</p>
          <h3 className="mt-4 text-base font-semibold text-white">How it works</h3>
          <p className="mt-1.5">
            {gridMine.loserCutBps / 100}% of each round&rsquo;s loser pot is collected as protocol revenue. Of that
            cut, {burn}% buys DRIP and burns it, {stakers}% buys DRIP for stakers, {mother}% grows the motherlode,
            {" "}{winners}% buys DRIP for that round&rsquo;s winners, and {winnersNvda}% buys{" "}
            <span className="text-white">NVDA</span> (tokenized NVIDIA) for the winners — so each round pays winners
            in both DRIP and stock, and stakers earn from both the buy pressure and the revenue share.
          </p>
        </Section>

        <Section id="tokenomics" title="Tokenomics">
          <p>DRIP is optimized for long-term holders.</p>
          <h3 className="mt-4 text-base font-semibold text-white">Supply</h3>
          <p className="mt-1.5">
            DRIP is a fair-launch token with a <span className="text-white">fixed</span> supply and zero insider or
            team allocation. The entire supply is created once at deploy and handed to the {site.launchpad} launch,
            which seeds the DRIP/USDG pool. The protocol <span className="text-white">never mints</span> — it only
            buys and burns.
          </p>
          <h3 className="mt-4 text-base font-semibold text-white">Fees</h3>
          <ul className="mt-1.5 space-y-1.5">
            {[
              `${gridMine.adminFeeBps / 100}% of each deploy → marketing/ops (skimmed at deploy, before the pool).`,
              `${gridMine.loserCutBps / 100}% of each loser pot → the cut (buyback).`,
              `${burn}% of the cut → buys DRIP, burned.`,
              `${stakers}% of the cut → buys DRIP for stakers.`,
              `${mother}% of the cut → buys DRIP for the motherlode.`,
              `${winners}% of the cut → buys DRIP for the round's winners.`,
              `${winnersNvda}% of the cut → buys NVDA for the round's winners.`,
              `${gridMine.refineFeeBps / 100}% refining fee on claimed DRIP → unclaimed holders.`,
            ].map((f) => (
              <li key={f} className="flex gap-2.5">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-lime" />
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section id="links" title="Links">
          <p>Key links and information.</p>
          <h3 className="mt-4 text-base font-semibold text-white">Contract</h3>
          <p className="mt-1.5">
            {site.launched && site.contractAddress ? (
              <span className="break-all font-mono text-xs text-white">{site.contractAddress}</span>
            ) : (
              <>
                DRIP is <span className="text-white">not deployed yet.</span> There is no official contract address —
                anything claiming one before launch is a scam. This app is a pre-launch demo (fake funds, no chain).
              </>
            )}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {[
              { label: "X", href: site.links.x },
            ].map((l) => (
              <a key={l.label} href={l.href} target="_blank" rel="noreferrer"
                className="rounded-lg border border-line bg-panel px-4 py-2 text-sm font-semibold text-white hover:border-mute/50">
                {l.label}
              </a>
            ))}
          </div>
        </Section>

        <p className="rounded-2xl border border-yellow-500/30 bg-yellow-500/5 p-4 text-xs">
          <span className="font-semibold text-yellow-500">Honest note.</span> Block Mine is a real-money game of
          chance by design, and this is a pre-launch demo. Nothing runs on mainnet until secure randomness and legal
          review are in place. See <Link href="/game/more/shield" className="text-lime hover:underline">Shield</Link>.
        </p>
      </div>
    </MorePage>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="mb-3 text-2xl font-semibold tracking-tight text-white">{title}</h2>
      {children}
    </section>
  );
}
