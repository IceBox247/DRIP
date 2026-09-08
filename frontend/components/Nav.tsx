import Link from "next/link";
import { Logo } from "./Logo";
import { site } from "@/lib/site";

const navLinks = [
  { href: "/game", label: "Mine" },
  { href: "/game/stake", label: "Stake" },
  { href: "/game/explore", label: "Explore" },
  { href: "/game/more/about", label: "About" },
];

export function Nav() {
  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-ink/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-content items-center justify-between px-5">
        <Link href="/" className="text-lg text-white">
          <Logo />
        </Link>

        <nav className="hidden items-center gap-7 md:flex">
          {navLinks.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-sm text-mute transition-colors hover:text-white"
            >
              {l.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <a
            href={site.links.github}
            target="_blank"
            rel="noreferrer"
            className="hidden text-sm text-mute transition-colors hover:text-white sm:inline"
          >
            GitHub
          </a>
          <Link
            href={site.links.app}
            className="rounded-lg bg-lime px-4 py-2 text-sm font-semibold text-ink transition-transform hover:scale-[1.02] active:scale-100"
          >
            {site.launched ? "Launch app" : "Preview"}
          </Link>
        </div>
      </div>
    </header>
  );
}
