// Fast keeper bot for Grid Mine / Block Mine.
//
// The Vercel cron keeper (frontend/app/api/keeper/route.ts) only runs once per minute, so a finished
// round can sit in "settling…" for up to ~60s. This standalone bot polls every couple of seconds and
// settles the INSTANT a round's window elapses, then processes rewards and (optionally) runs the
// AutoMineVault — so rounds turn over in ~1-3s instead of up to a minute.
//
// Run it on any always-on host (Railway, Render, Fly, a VPS, a Raspberry Pi):
//   cd keeper && npm install && node bot.mjs
//
// Required env:
//   KEEPER_PRIVATE_KEY   dedicated hot wallet (needs a little ETH for gas)
//   GRIDMINE_ADDRESS     the GridMine contract
// Optional env:
//   RPC_URL              default https://rpc.mainnet.chain.robinhood.com
//   CHAIN_ID             default 4663
//   RANDOMNESS_ADDRESS   mock randomness source — seeds a fresh word each settle (testnet/mock only)
//   AUTOMINE_ADDRESS     AutoMineVault (v2) — runs every active auto-mine plan each round
//   POLL_MS              default 2000
//   KEEPER_MIN_OUT       processRewards slippage floor (default 0)

import { createWalletClient, createPublicClient, http, defineChain } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const RPC = process.env.RPC_URL || "https://rpc.mainnet.chain.robinhood.com";
const CHAIN_ID = Number(process.env.CHAIN_ID || 4663);
const GM = process.env.GRIDMINE_ADDRESS;
const RNG = process.env.RANDOMNESS_ADDRESS;
const AUTOMINE = process.env.AUTOMINE_ADDRESS;
const POLL_MS = Number(process.env.POLL_MS || 2000);
const MIN_OUT = BigInt(process.env.KEEPER_MIN_OUT || "0");
const PK = process.env.KEEPER_PRIVATE_KEY;

if (!PK || !GM) { console.error("Set KEEPER_PRIVATE_KEY and GRIDMINE_ADDRESS"); process.exit(1); }

const chain = defineChain({ id: CHAIN_ID, name: "Robinhood Chain", nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });
const account = privateKeyToAccount(PK.startsWith("0x") ? PK : `0x${PK}`);
const pub = createPublicClient({ chain, transport: http() });
const wallet = createWalletClient({ account, chain, transport: http() });

const gm = [
  { type: "function", name: "currentRound", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "timeLeft", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "closeRound", stateMutability: "nonpayable", inputs: [], outputs: [] },
  { type: "function", name: "processRewards", stateMutability: "nonpayable", inputs: [{ type: "uint256" }, { type: "uint256" }, { type: "uint256" }], outputs: [] },
  { type: "function", name: "getRound", stateMutability: "view", inputs: [{ type: "uint256" }], outputs: [{ type: "tuple", components: [
    { name: "startTime", type: "uint64" }, { name: "status", type: "uint8" }, { name: "winningTile", type: "uint8" }, { name: "motherlodeHit", type: "bool" },
    { name: "rewardsProcessed", type: "bool" }, { name: "soloMode", type: "bool" }, { name: "soloWinner", type: "address" }, { name: "totalIn", type: "uint256" },
    { name: "winnerStake", type: "uint256" }, { name: "winnerPotUsdg", type: "uint256" }, { name: "cutUsdg", type: "uint256" }, { name: "rewardDrip", type: "uint256" }, { name: "rewardNvda", type: "uint256" } ] }] },
];
const setWordAbi = [{ type: "function", name: "setWord", stateMutability: "nonpayable", inputs: [{ type: "uint256" }], outputs: [] }];
const amAbi = [
  { type: "function", name: "allPlayers", stateMutability: "view", inputs: [], outputs: [{ type: "address[]" }] },
  { type: "function", name: "isActive", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "executeMany", stateMutability: "nonpayable", inputs: [{ type: "address[]" }], outputs: [{ type: "uint256" }] },
];

async function send(fn, args = []) {
  const { request } = await pub.simulateContract({ address: GM, abi: gm, functionName: fn, args, account });
  return wallet.writeContract(request);
}

async function tick() {
  // 1) Settle the moment the window has elapsed.
  try {
    const tl = await pub.readContract({ address: GM, abi: gm, functionName: "timeLeft" });
    if (tl === 0n) {
      if (RNG) {
        try {
          const bytes = new Uint8Array(32); crypto.getRandomValues(bytes);
          const word = BigInt("0x" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(""));
          const { request } = await pub.simulateContract({ address: RNG, abi: setWordAbi, functionName: "setWord", args: [word], account });
          await wallet.writeContract(request);
        } catch { /* non-fatal */ }
      }
      try { const h = await send("closeRound"); console.log(new Date().toISOString(), "closeRound", h); } catch { /* window not elapsed / already closed */ }
    }
  } catch (e) { /* transient read */ }

  // 2) Process rewards for any settled-unprocessed round.
  try {
    const cur = await pub.readContract({ address: GM, abi: gm, functionName: "currentRound" });
    const floor = cur > 40n ? cur - 40n : 1n;
    let done = 0;
    for (let r = floor; r < cur && done < 5; r++) {
      try {
        const g = await pub.readContract({ address: GM, abi: gm, functionName: "getRound", args: [r] });
        if (g.status === 2 && !g.rewardsProcessed) {
          const h = await send("processRewards", [r, MIN_OUT, MIN_OUT]);
          console.log(new Date().toISOString(), "processRewards", r.toString(), h);
          done++;
        }
      } catch { /* already processed / not settled yet */ }
    }
  } catch { /* transient */ }

  // 3) Auto-mine (v2 vault) — run every active plan for the round.
  if (AUTOMINE) {
    try {
      const players = await pub.readContract({ address: AUTOMINE, abi: amAbi, functionName: "allPlayers" });
      const active = [];
      for (const p of players) { try { if (await pub.readContract({ address: AUTOMINE, abi: amAbi, functionName: "isActive", args: [p] })) active.push(p); } catch {} }
      if (active.length) {
        const { request } = await pub.simulateContract({ address: AUTOMINE, abi: amAbi, functionName: "executeMany", args: [active], account });
        const h = await wallet.writeContract(request);
        console.log(new Date().toISOString(), "autoMine.executeMany", active.length, h);
      }
    } catch { /* no vault / transient */ }
  }
}

console.log(`Fast keeper up — ${account.address} on chain ${CHAIN_ID}, polling every ${POLL_MS}ms`);
for (;;) { await tick(); await new Promise((r) => setTimeout(r, POLL_MS)); }
