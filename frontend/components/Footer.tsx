import { Logo } from "./Logo";
import { site } from "@/lib/site";

export function Footer() {
  return (
    <footer className="border-t border-line/70">
      <div className="mx-auto max-w-content px-5 py-12">
        <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
          <div className="max-w-sm">
            <Logo className="text-white" />
            <p className="mt-3 text-sm text-mute">
              A fair-launch token on {site.chain}, launched via {site.launchpad}. Rewards paid in
              tokenized stock.
            </p>
          </div>

          <div className="flex gap-12">
            <div className="flex flex-col gap-2 text-sm">
              <span className="mb-1 text-xs uppercase tracking-wide text-mute/70">Product</span>
              <a href="/#how" className="text-mute hover:text-white">How it works</a>
              <a href="/#rewards" className="text-mute hover:text-white">Rewards</a>
              <a href="/#referrals" className="text-mute hover:text-white">Referrals</a>
            </div>
            <div className="flex flex-col gap-2 text-sm">
              <span className="mb-1 text-xs uppercase tracking-wide text-mute/70">Resources</span>
              <a href={site.links.spec} target="_blank" rel="noreferrer" className="text-mute hover:text-white">Spec</a>
              <a href={site.links.github} target="_blank" rel="noreferrer" className="text-mute hover:text-white">GitHub</a>
              <a href={site.links.x} target="_blank" rel="noreferrer" className="text-mute hover:text-white">X</a>
            </div>
          </div>
        </div>

        {/* Compliance notice — required posture per docs/BLOCKERS.md #2. Not legal advice. */}
        <div className="mt-10 rounded-xl border border-line bg-panel/60 p-4 text-xs leading-relaxed text-mute">
          <strong className="text-mute/90">Important.</strong> Nothing on this site is financial,
          investment, or legal advice, or an offer or solicitation to buy any security or token.
          Tokenized stocks may be restricted in your jurisdiction and are{" "}
          <span className="text-mute/90">not available to U.S. persons</span>. Access may be
          geo-restricted. Digital assets are volatile and you can lose everything. Do your own
          research and consult a qualified professional.
        </div>

        <p className="mt-6 text-xs text-mute/60">
          © {new Date().getFullYear()} {site.name}. Built on {site.chain}.
        </p>
      </div>
    </footer>
  );
}
