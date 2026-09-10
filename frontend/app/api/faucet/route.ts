import { NextResponse } from "next/server";
import { createPublicClient, createWalletClient, http, parseEther, parseUnits, isAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { robinhoodChain, addresses, contractsReady } from "@/lib/contracts";

// Gasless faucet — the keeper wallet pays gas so a brand-new user (zero testnet ETH) can still get
// play tokens. It mints test USDG to the address AND, if the address has no gas, drips a little ETH
// so they can then deploy/harvest/stake themselves. Testnet only (open-mint mock USDG, no value).
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

const mintAbi = [
  { type: "function", name: "mint", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [] },
] as const;

const USDG_AMOUNT = parseUnits("1000", 6); // 1,000 test USDG (6dp mock)
const GAS_DRIP = parseEther("0.003"); // enough for several game txs on this L2
const GAS_MIN = parseEther("0.001"); // only drip if the user is below this

export async function POST(req: Request) {
  if (!contractsReady) return NextResponse.json({ error: "contracts not configured" }, { status: 503 });
  const pk = process.env.KEEPER_PRIVATE_KEY;
  if (!pk) return NextResponse.json({ error: "faucet wallet not configured" }, { status: 503 });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  const to = (body as { address?: string }).address;
  if (!to || !isAddress(to)) return NextResponse.json({ error: "invalid address" }, { status: 400 });

  const account = privateKeyToAccount(pk.startsWith("0x") ? (pk as `0x${string}`) : (`0x${pk}` as `0x${string}`));
  const transport = http();
  const pub = createPublicClient({ chain: robinhoodChain, transport });
  const wallet = createWalletClient({ account, chain: robinhoodChain, transport });
  const out: { usdg?: string; gas?: string; error?: string } = {};

  try {
    // 1) Drip a little native gas first, so the user can transact afterwards.
    const bal = await pub.getBalance({ address: to as `0x${string}` });
    if (bal < GAS_MIN) {
      out.gas = await wallet.sendTransaction({ to: to as `0x${string}`, value: GAS_DRIP });
    }
    // 2) Mint test USDG to the user (keeper pays the gas for this call).
    const { request } = await pub.simulateContract({
      address: addresses.usdg as `0x${string}`, abi: mintAbi, functionName: "mint", args: [to as `0x${string}`, USDG_AMOUNT], account,
    });
    out.usdg = await wallet.writeContract(request);
    return NextResponse.json({ ok: true, ...out });
  } catch (e) {
    return NextResponse.json({ ok: false, ...out, error: String(e) }, { status: 500 });
  }
}
