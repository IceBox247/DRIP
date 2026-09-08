"use client";

import { useState } from "react";
import { site } from "@/lib/site";

// Verified-contract / anti-scam strip.
// - Pre-launch (site.launched === false): there is NO contract yet, so we say so plainly. This
//   is itself the anti-scam message — anything claiming a $DRIP CA before launch is fake.
// - At launch: set site.contractAddress + site.launched = true. It then shows the real CA with a
//   copy button and the "any other CA is not ours" warning (the Superstables pattern).
export function ContractStrip() {
  const [copied, setCopied] = useState(false);
  const ca = site.contractAddress;
  const live = site.launched && !!ca;

  async function copy() {
    if (!ca) return;
    try {
      await navigator.clipboard.writeText(ca);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable — ignore */
    }
  }

  if (!live) {
    return (
      <div className="border-b border-line/70 bg-panel/50">
        <div className="mx-auto flex max-w-content flex-col gap-1 px-5 py-2.5 text-xs sm:flex-row sm:items-center sm:gap-3">
          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-line bg-ink px-2.5 py-0.5 font-medium text-mute">
            <span className="h-1.5 w-1.5 rounded-full bg-mute" />
            Not launched
          </span>
          <span className="text-mute">
            No official {site.ticker} contract exists yet. It will be published here at launch —{" "}
            <span className="text-white">
              anything claiming a {site.ticker} address before then is a scam.
            </span>
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="border-b border-line/70 bg-panel/50">
      <div className="mx-auto flex max-w-content flex-col gap-2 px-5 py-2.5 text-xs sm:flex-row sm:items-center sm:gap-3">
        <span className="inline-flex w-fit items-center gap-2 rounded-full border border-lime/40 bg-lime/10 px-2.5 py-0.5 font-medium text-lime">
          <span className="h-1.5 w-1.5 rounded-full bg-lime animate-pulseDot" />
          Official contract
        </span>
        <code className="truncate font-mono text-white" title={ca ?? ""}>
          {ca}
        </code>
        <button
          type="button"
          onClick={copy}
          className="w-fit rounded-md border border-line bg-ink px-2.5 py-1 font-medium text-mute transition-colors hover:text-white"
        >
          {copied ? "Copied" : "Copy"}
        </button>
        <span className="text-mute sm:ml-auto">
          Any other {site.ticker} contract is <span className="text-white">not ours.</span>
        </span>
      </div>
    </div>
  );
}
