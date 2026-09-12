"use client";

import { useEffect } from "react";

// Route-level error boundary. If anything throws while rendering the app, the user sees this instead
// of a silent blank/black screen — with a one-tap reload. (Next.js renders this in place of the
// crashed segment.)
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Surface it for debugging without leaking the stack into the UI.
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-ink px-6 text-center">
      <div className="text-lg font-semibold text-white">Something went wrong loading this page</div>
      <p className="max-w-xs text-sm text-mute">
        A quick reload usually fixes it. If it keeps happening, switch your browser back to the normal
        (mobile) view and try again.
      </p>
      <div className="mt-1 flex gap-2">
        <button onClick={() => reset()}
          className="rounded-xl bg-lime px-5 py-2.5 text-sm font-semibold text-ink">Try again</button>
        <button onClick={() => { if (typeof window !== "undefined") window.location.reload(); }}
          className="rounded-xl border border-line px-5 py-2.5 text-sm font-semibold text-white">Reload</button>
      </div>
    </div>
  );
}
