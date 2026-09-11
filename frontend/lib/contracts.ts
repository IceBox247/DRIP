import { defineChain } from "viem";

// Robinhood Chain (Arbitrum Orbit L2). Mainnet 4663 / testnet 46630. The RPC the keeper/reads use is
// env-driven, so the same code targets either network.
export const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 4663);
/** Testnet (46630) has mintable mock tokens + a faucet; mainnet (4663) uses real tokens. */
export const isTestnet = CHAIN_ID === 46630;
const RPC = process.env.RPC_URL || process.env.NEXT_PUBLIC_RPC_URL || "https://rpc.mainnet.chain.robinhood.com";

export const robinhoodChain = defineChain({
  id: CHAIN_ID,
  name: CHAIN_ID === 46630 ? "Robinhood Chain Testnet" : "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
  blockExplorers: { default: { name: "Blockscout", url: "https://robinhoodchain.blockscout.com" } },
});

// Deployed addresses. Default to the LIVE mainnet deployment (Grid Mine run #6) so the app works
// out of the box even if a Vercel env is missing or stale; env vars still override for a different
// deploy. Real USDG + real NVDA; DRIP = FLYCOINHUNT; game contracts from the mainnet deploy.
const MAINNET = {
  usdg: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168",
  drip: "0x8f519E3e55b44014d6dD323BB3dE561Bf6CB6f1C",
  nvda: "0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC",
  gridMine: "0x2b463b2FCa32E4B0532EDb1eaACB6c3EC0BBAf89",
  refining: "0x93D0b1F57075403bfD289A58850a8331a3a281Ee",
  stake: "0x6CE30eFA833D207ce8f82797dA1E706b1739Ec11",
  randomness: "0x97ba2e34574fAe6B7bD7420a1dB1875CEc937Ae5",
} as const;

export const addresses = {
  usdg: (process.env.NEXT_PUBLIC_USDG_ADDRESS || MAINNET.usdg) as `0x${string}` | "",
  drip: (process.env.NEXT_PUBLIC_DRIP_ADDRESS || MAINNET.drip) as `0x${string}` | "",
  nvda: (process.env.NEXT_PUBLIC_NVDA_ADDRESS || MAINNET.nvda) as `0x${string}` | "",
  gridMine: (process.env.NEXT_PUBLIC_GRIDMINE_ADDRESS || MAINNET.gridMine) as `0x${string}` | "",
  refining: (process.env.NEXT_PUBLIC_REFINING_ADDRESS || MAINNET.refining) as `0x${string}` | "",
  stake: (process.env.NEXT_PUBLIC_STAKE_ADDRESS || MAINNET.stake) as `0x${string}` | "",
  randomness: (process.env.NEXT_PUBLIC_RANDOMNESS_ADDRESS || MAINNET.randomness) as `0x${string}` | "",
};

/** True once the game contracts are deployed and their addresses are configured. */
export const contractsReady = !!addresses.gridMine && !!addresses.usdg;

// Minimal GridMine ABI — the functions the keeper + client actually call. Mirrors GridMine.sol.
export const gridMineAbi = [
  { type: "function", name: "currentRound", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "timeLeft", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "motherlodeDrip", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "ROUND_SECONDS", stateMutability: "view", inputs: [], outputs: [{ type: "uint32" }] },
  {
    type: "function", name: "tileTotal", stateMutability: "view",
    inputs: [{ type: "uint256" }, { type: "uint8" }], outputs: [{ type: "uint256" }],
  },
  {
    type: "function", name: "stakeOf", stateMutability: "view",
    inputs: [{ type: "uint256" }, { type: "uint8" }, { type: "address" }], outputs: [{ type: "uint256" }],
  },
  // Per-round, per-player claim flags — so the app can tell what's still HARVESTABLE (unclaimed).
  { type: "function", name: "usdgClaimed", stateMutability: "view", inputs: [{ type: "uint256" }, { type: "address" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "dripClaimed", stateMutability: "view", inputs: [{ type: "uint256" }, { type: "address" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "nvdaClaimed", stateMutability: "view", inputs: [{ type: "uint256" }, { type: "address" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "closeRound", stateMutability: "nonpayable", inputs: [], outputs: [] },
  {
    type: "function", name: "processRewards", stateMutability: "nonpayable",
    inputs: [{ name: "round", type: "uint256" }, { name: "minDripOut", type: "uint256" }, { name: "minNvdaOut", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function", name: "deploy", stateMutability: "nonpayable",
    inputs: [{ name: "tile", type: "uint8" }, { name: "amount", type: "uint256" }], outputs: [],
  },
  {
    type: "function", name: "deployMany", stateMutability: "nonpayable",
    inputs: [{ name: "tiles", type: "uint8[]" }, { name: "amounts", type: "uint256[]" }], outputs: [],
  },
  { type: "function", name: "harvest", stateMutability: "nonpayable", inputs: [{ name: "round", type: "uint256" }], outputs: [] },
  {
    type: "function", name: "getRound", stateMutability: "view", inputs: [{ name: "round", type: "uint256" }],
    outputs: [{
      type: "tuple", components: [
        { name: "startTime", type: "uint64" }, { name: "status", type: "uint8" }, { name: "winningTile", type: "uint8" },
        { name: "motherlodeHit", type: "bool" }, { name: "rewardsProcessed", type: "bool" }, { name: "soloMode", type: "bool" },
        { name: "soloWinner", type: "address" }, { name: "totalIn", type: "uint256" }, { name: "winnerStake", type: "uint256" },
        { name: "winnerPotUsdg", type: "uint256" }, { name: "cutUsdg", type: "uint256" }, { name: "rewardDrip", type: "uint256" },
        { name: "rewardNvda", type: "uint256" },
      ],
    }],
  },
] as const;

export const erc20Abi = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ type: "address" }, { type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
] as const;
