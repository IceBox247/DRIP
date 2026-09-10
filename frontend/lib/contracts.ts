import { defineChain } from "viem";

// Robinhood Chain (Arbitrum Orbit L2). Mainnet 4663 / testnet 46630. The RPC the keeper/reads use is
// env-driven, so the same code targets either network.
const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 4663);
const RPC = process.env.RPC_URL || process.env.NEXT_PUBLIC_RPC_URL || "https://rpc.mainnet.chain.robinhood.com";

export const robinhoodChain = defineChain({
  id: CHAIN_ID,
  name: CHAIN_ID === 46630 ? "Robinhood Chain Testnet" : "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
  blockExplorers: { default: { name: "Blockscout", url: "https://robinhoodchain.blockscout.com" } },
});

// Deployed addresses — filled via Vercel env after `forge script DeployGame`. Empty string until then.
export const addresses = {
  usdg: (process.env.NEXT_PUBLIC_USDG_ADDRESS ?? "") as `0x${string}` | "",
  drip: (process.env.NEXT_PUBLIC_DRIP_ADDRESS ?? "") as `0x${string}` | "",
  nvda: (process.env.NEXT_PUBLIC_NVDA_ADDRESS ?? "") as `0x${string}` | "",
  gridMine: (process.env.NEXT_PUBLIC_GRIDMINE_ADDRESS ?? "") as `0x${string}` | "",
  refining: (process.env.NEXT_PUBLIC_REFINING_ADDRESS ?? "") as `0x${string}` | "",
  stake: (process.env.NEXT_PUBLIC_STAKE_ADDRESS ?? "") as `0x${string}` | "",
};

/** True once the game contracts are deployed and their addresses are configured. */
export const contractsReady = !!addresses.gridMine && !!addresses.usdg;

// Minimal GridMine ABI — the functions the keeper + client actually call. Mirrors GridMine.sol.
export const gridMineAbi = [
  { type: "function", name: "currentRound", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "timeLeft", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "motherlodeDrip", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
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
