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
