"use client";

// Root error boundary — the last line of defence. If the root layout itself throws (so `error.tsx`
// can't render), this replaces the whole document instead of leaving a blank screen. It must render
// its own <html>/<body>.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#0a0a0a", color: "#fff", fontFamily: "system-ui, sans-serif" }}>
        <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: 24, textAlign: "center" }}>
          <div style={{ fontSize: 18, fontWeight: 600 }}>Something went wrong</div>
          <p style={{ maxWidth: 320, fontSize: 14, color: "#9ca3af" }}>
            Please reload the page. If you switched to desktop view, switch back to the normal view first.
          </p>
          <button onClick={() => reset()}
            style={{ borderRadius: 12, background: "#bef264", color: "#0a0a0a", fontWeight: 600, padding: "10px 20px", border: "none" }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
