import { createPublicClient, http } from "viem";
const RPC = "https://rpc.mainnet.chain.robinhood.com";
const GM = "0x2b463b2FCa32E4B0532EDb1eaACB6c3EC0BBAf89";
const PLAYER = "0x25d4b48a4dd3f88f7b13e707f80e7e1a8cddc97b";
const abi = [
  { type:"function", name:"currentRound", stateMutability:"view", inputs:[], outputs:[{type:"uint256"}] },
  { type:"function", name:"getRound", stateMutability:"view", inputs:[{type:"uint256"}], outputs:[{type:"tuple", components:[
    {name:"startTime",type:"uint64"},{name:"status",type:"uint8"},{name:"winningTile",type:"uint8"},
    {name:"motherlodeHit",type:"bool"},{name:"rewardsProcessed",type:"bool"},{name:"soloMode",type:"bool"},
    {name:"soloWinner",type:"address"},{name:"totalIn",type:"uint256"},{name:"winnerStake",type:"uint256"},
    {name:"winnerPotUsdg",type:"uint256"},{name:"cutUsdg",type:"uint256"},{name:"rewardDrip",type:"uint256"},{name:"rewardNvda",type:"uint256"}]}] },
  { type:"function", name:"stakeOf", stateMutability:"view", inputs:[{type:"uint256"},{type:"uint8"},{type:"address"}], outputs:[{type:"uint256"}] },
  { type:"function", name:"usdgClaimed", stateMutability:"view", inputs:[{type:"uint256"},{type:"address"}], outputs:[{type:"bool"}] },
  { type:"function", name:"dripClaimed", stateMutability:"view", inputs:[{type:"uint256"},{type:"address"}], outputs:[{type:"bool"}] },
  { type:"function", name:"nvdaClaimed", stateMutability:"view", inputs:[{type:"uint256"},{type:"address"}], outputs:[{type:"bool"}] },
];
const c = createPublicClient({ transport: http(RPC) });
const cur = await c.readContract({ address:GM, abi, functionName:"currentRound" });
console.log("currentRound =", cur.toString());
const St = ["Open","Closed","Settled"];
for (let r = 1n; r <= cur; r++) {
  const g = await c.readContract({ address:GM, abi, functionName:"getRound", args:[r] });
  const wt = g.winningTile;
  const myWinTileStake = await c.readContract({ address:GM, abi, functionName:"stakeOf", args:[r, wt, PLAYER] });
  // also check my stake across all 25 tiles to see if I deployed at all
  let myTotal = 0n; let tilesOn = [];
  for (let t=0;t<25;t++){ const s = await c.readContract({ address:GM, abi, functionName:"stakeOf", args:[r, t, PLAYER] }); if(s>0n){myTotal+=s; tilesOn.push(`${t}:${(Number(s)/1e6).toFixed(3)}`);} }
  const uc = await c.readContract({ address:GM, abi, functionName:"usdgClaimed", args:[r, PLAYER] });
  const dc = await c.readContract({ address:GM, abi, functionName:"dripClaimed", args:[r, PLAYER] });
  const nc = await c.readContract({ address:GM, abi, functionName:"nvdaClaimed", args:[r, PLAYER] });
  console.log(`\n== Round ${r} == status=${St[g.status]} winningTile=${wt} rewardsProcessed=${g.rewardsProcessed} soloMode=${g.soloMode} soloWinner=${g.soloWinner}`);
  console.log(`   totalIn=${(Number(g.totalIn)/1e6).toFixed(3)} winnerStake=${(Number(g.winnerStake)/1e6).toFixed(3)} winnerPotUsdg=${(Number(g.winnerPotUsdg)/1e6).toFixed(3)} rewardDrip=${(Number(g.rewardDrip)/1e18).toFixed(4)} rewardNvda=${(Number(g.rewardNvda)/1e18).toFixed(6)}`);
  console.log(`   MY stake on winning tile ${wt} = ${(Number(myWinTileStake)/1e6).toFixed(3)} USDG ; my tiles this round = [${tilesOn.join(", ")}] total=${(Number(myTotal)/1e6).toFixed(3)}`);
  console.log(`   claimed flags: usdg=${uc} drip=${dc} nvda=${nc}`);
  if (g.status===2 && g.winnerStake>0n && myWinTileStake>0n) {
    const usdgOut = myWinTileStake + (g.winnerPotUsdg*myWinTileStake)/g.winnerStake;
    console.log(`   >>> WINNER: harvestable USDG = ${(Number(usdgOut)/1e6).toFixed(4)} (claimed=${uc})`);
  } else {
    console.log(`   >>> not a winner on this round (no stake on winning tile) — nothing to harvest`);
  }
}
