import Link from "next/link";
import { AppChrome } from "./AppChrome";

// Shared chrome for the "More" sub-screens (About / Changelog / Reserve / Rewards / Shield / Explore):
// a back link to the More menu + a title, inside the app chrome.
export function MorePage({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <AppChrome>
      <div className="px-5 pt-5">
        <Link href="/game/more" className="inline-flex items-center gap-1 text-sm text-mute hover:text-white">
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 15l-5-5 5-5" />
          </svg>
          More
        </Link>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-mute">{subtitle}</p>}
        <div className="mt-6 pb-6">{children}</div>
      </div>
    </AppChrome>
  );
}
