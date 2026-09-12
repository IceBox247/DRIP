// Compact number formatting for the UI — keeps big token amounts from blowing out the layout.
// 10,000 → "10k", 77,309.9 → "77.3k", 100,000 → "100k", 1,000,000 → "1M", 1,000,000,000 → "1B".
// Small values keep normal precision (0.30, 7.5, 2.14). Trailing zeros are trimmed.

const trim = (s: string) => s.replace(/\.0+$|(\.\d*?)0+$/, "$1");

export function compact(n: number, smallFrac = 2): string {
  if (!isFinite(n)) return "0";
  const abs = Math.abs(n);
  if (abs >= 1e9) return trim((n / 1e9).toFixed(2)) + "B";
  if (abs >= 1e6) return trim((n / 1e6).toFixed(2)) + "M";
  if (abs >= 1e3) return trim((n / 1e3).toFixed(1)) + "k";
  // Under 1000: show real precision (more decimals for sub-1 values so small amounts stay visible).
  return trim(n.toFixed(abs > 0 && abs < 1 ? 4 : smallFrac));
}

// Turn a raw wallet/RPC error into a short, human sentence. Wallet libraries surface scary,
// unreadable blobs ("An unknown RPC error occurred. Request Arguments: from 0x… to 0x… data 0x…"),
// which is exactly what we don't want a player to see. This maps the common cases to plain English
// and, for anything unrecognized, returns a calm generic line instead of the raw dump.
export function friendlyError(e: unknown, fallback = "Something went wrong — please try again."): string {
  const raw = e instanceof Error ? e.message : typeof e === "string" ? e : "";
  const m = raw.toLowerCase();
  if (!raw) return fallback;
  if (m.includes("user rejected") || m.includes("user denied") || m.includes("rejected the request")) return "You cancelled the request.";
  if (m.includes("insufficient funds") || m.includes("insufficient eth") || m.includes("exceeds the balance")) return "Not enough balance to cover this transaction (including the network fee).";
  if (m.includes("insufficient allowance") || m.includes("transferfrom")) return "Token approval needed — approve, then try again.";
  if (m.includes("slippage") || m.includes("min") && m.includes("out")) return "Price moved too much — try again or adjust the amount.";
  if (m.includes("deadline")) return "The transaction expired — please try again.";
  if (m.includes("nonce")) return "Transaction out of order — refresh and try again.";
  if (m.includes("timeout") || m.includes("timed out")) return "The network is slow right now — please try again.";
  if (m.includes("rate limit") || m.includes("429") || m.includes("too many requests")) return "The network is busy — give it a moment and try again.";
  if (m.includes("chain") && m.includes("mismatch")) return "Wrong network — switch your wallet to Robinhood Chain.";
  if (m.includes("reverted") || m.includes("execution reverted")) return "The network rejected this transaction — it may no longer be valid.";
  if (m.includes("rpc") || m.includes("fetch") || m.includes("network")) return "Couldn't reach the network — please try again in a moment.";
  // Unknown: never leak the raw RPC blob. Keep only a short first clause if it looks human, else generic.
  const firstLine = raw.split(/[\n.]/)[0].trim();
  if (firstLine.length > 0 && firstLine.length <= 80 && !firstLine.startsWith("0x") && !/0x[0-9a-f]{6,}/i.test(firstLine)) return firstLine;
  return fallback;
}
