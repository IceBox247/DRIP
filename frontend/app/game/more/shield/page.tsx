import { MorePage } from "@/components/MorePage";

// Shield — fair-play & anti-manipulation guarantees, and the honest state of each.
export const metadata = { title: "Shield — Drip" };

const guards = [
  { title: "Unpredictable winner", body: "The winning tile comes from a secure RNG (VRF or bonded commit–reveal). The winner is never derived from block hash or timestamp alone.", state: "in progress" },
  { title: "Owner can't pick", body: "No admin function selects a tile or a winner. The contract has no owner key over round outcomes.", state: "by design" },
  { title: "Entry fee can't skew odds", body: "The 1% fee is skimmed at deploy, before funds enter the pool, so it never touches the win/loss math.", state: "shipped" },
  { title: "You can't win from yourself", body: "A lone player who covers the winning tile just gets their net stake back — the loser pot is zero, so no cut and no buyback.", state: "shipped" },
  { title: "Fixed supply", body: "DRIP is never minted. Every reward is bought from the market, so the game can't inflate the token.", state: "shipped" },
  { title: "Slippage-bounded buyback", body: "The cut→DRIP swap is a permissionless keeper step with a caller-supplied minimum out, so it can't be sandwiched into a bad fill.", state: "shipped" },
];

export default function ShieldPage() {
  return (
    <MorePage title="Shield" subtitle="Fair-play guarantees — and where each one stands.">
      <div className="space-y-3">
        {guards.map((g) => (
          <div key={g.title} className="rounded-2xl border border-line bg-panel p-4">
            <div className="flex items-start justify-between gap-3">
              <h2 className="font-semibold text-white">{g.title}</h2>
              <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                g.state === "shipped" ? "border border-lime/40 bg-lime/10 text-lime"
                : g.state === "by design" ? "border border-line bg-panel2 text-mute"
                : "border border-yellow-500/40 bg-yellow-500/10 text-yellow-500"
              }`}>{g.state}</span>
            </div>
            <p className="mt-2 text-sm text-mute">{g.body}</p>
          </div>
        ))}
      </div>
      <div className="mt-5 rounded-2xl border border-yellow-500/30 bg-yellow-500/5 p-4 text-xs text-mute">
        <span className="font-semibold text-yellow-500">Honest note.</span> This is a real-money game of chance and a
        pre-launch demo. Secure randomness and legal/geo review must be in place before any mainnet round. See the repo
        blockers for the full list.
      </div>
    </MorePage>
  );
}
