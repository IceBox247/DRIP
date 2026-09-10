import { NextResponse } from "next/server";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { robinhoodChain, addresses, gridMineAbi, contractsReady } from "@/lib/contracts";

// Keeper — runs each round: closeRound() then processRewards() on the freshly-settled round(s).
// Called by Vercel Cron (see vercel.json). Authorized by CRON_SECRET so nobody else can trigger it.
//
// Requires (server-only env): KEEPER_PRIVATE_KEY (dedicated hot wallet), CRON_SECRET, RPC_URL,
// and the deployed contract addresses. Missing any → the route no-ops with a clear message.
//
// NOTE: minDripOut/minNvdaOut are passed as KEEPER_MIN_OUT (default 0). 0 disables slippage
// protection — fine for testnet; before mainnet, compute a real minimum from a quoter.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization");
  const url = new URL(req.url);
  return auth === `Bearer ${secret}` || url.searchParams.get("secret") === secret;
}

async function run() {
  const pk = process.env.KEEPER_PRIVATE_KEY;
  if (!contractsReady) return { ok: false, reason: "contracts not configured" };
  if (!pk) return { ok: false, reason: "KEEPER_PRIVATE_KEY not set" };

  const account = privateKeyToAccount(pk.startsWith("0x") ? (pk as `0x${string}`) : (`0x${pk}` as `0x${string}`));
  const transport = http();
  const pub = createPublicClient({ chain: robinhoodChain, transport });
  const wallet = createWalletClient({ account, chain: robinhoodChain, transport });
  const gm = { address: addresses.gridMine as `0x${string}`, abi: gridMineAbi } as const;
  const minOut = BigInt(process.env.KEEPER_MIN_OUT ?? "0");
  const actions: string[] = [];

  // 1) Close the open round if its window has elapsed (reverts otherwise — that's fine).
  try {
    const { request } = await pub.simulateContract({ ...gm, functionName: "closeRound", account });
    const hash = await wallet.writeContract(request);
    actions.push(`closeRound ${hash}`);
  } catch {
    actions.push("closeRound skipped (window not elapsed)");
  }

  // 2) Process rewards for any recently-settled, unprocessed round.
  const current = (await pub.readContract({ ...gm, functionName: "currentRound" })) as bigint;
  for (const r of [current - BigInt(1), current - BigInt(2)]) {
    if (r < BigInt(1)) continue;
    try {
      const round = (await pub.readContract({ ...gm, functionName: "getRound", args: [r] })) as {
        status: number; rewardsProcessed: boolean;
      };
      if (round.status === 2 /* Settled */ && !round.rewardsProcessed) {
        const { request } = await pub.simulateContract({ ...gm, functionName: "processRewards", args: [r, minOut, minOut], account });
        const hash = await wallet.writeContract(request);
        actions.push(`processRewards(${r}) ${hash}`);
      }
    } catch {
      actions.push(`processRewards(${r}) skipped`);
    }
  }

  return { ok: true, keeper: account.address, actions };
}

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await run());
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}

export const POST = GET;
