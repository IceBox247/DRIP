// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {DripToken} from "../src/game/DripToken.sol";
import {GridMine} from "../src/game/GridMine.sol";
import {RefiningVault} from "../src/game/RefiningVault.sol";
import {StakeVault} from "../src/game/StakeVault.sol";
import {ISwapRouter} from "../src/game/interfaces/ISwapRouter.sol";
import {IRandomnessSource} from "../src/game/interfaces/IRandomnessSource.sol";
import {CommitRevealRandomness} from "../src/game/CommitRevealRandomness.sol";
import {PonsSwapAdapter} from "../src/game/PonsSwapAdapter.sol";
import {PoolKey} from "../src/game/interfaces/IUniswapV4.sol";
import {MockERC20} from "../src/game/mocks/MockERC20.sol";
import {MockRandomness} from "../src/game/mocks/MockRandomness.sol";
import {MockSwapRouter} from "../src/game/mocks/MockSwapRouter.sol";

/// @notice Deploy + wire Grid Mine v2. TESTNET (46630) ONLY — docs/BLOCKERS.md #4.
///
/// Env (optional on testnet; mocks are deployed when an address is 0):
///   USDG           - deploy asset (real USDG on mainnet; 0 => mock)
///   SWAP_ROUTER    - DRIP/USDG swap adapter (real v4 adapter on mainnet; 0 => mock, auto-funded)
///   RANDOMNESS     - IRandomnessSource (VRF/commit-reveal; 0 => mock)
///   MARKETING      - receives the 1% admin fee (default: broadcaster)
///   FEE_SINK       - refining fee when no unclaimed holders (default: broadcaster)
///   CAP            - DRIP fixed supply in whole tokens (default 3_000_000)
///
/// NOTE: DRIP is FIXED SUPPLY (no mint). On mainnet the whole supply goes to the Pons launch, which
/// seeds the DRIP/USDG pool the game buys from. Here the deployer holds it; for a mock router we
/// seed the router with DRIP so buys work in testing.
contract DeployGame is Script {
    function run() external {
        address deployer = msg.sender;
        address usdg = vm.envOr("USDG", address(0));
        address nvda = vm.envOr("NVDA", address(0));
        address swapRouter = vm.envOr("SWAP_ROUTER", address(0));
        address randomness = vm.envOr("RANDOMNESS", address(0));
        address marketing = vm.envOr("MARKETING", deployer);
        address feeSink = vm.envOr("FEE_SINK", deployer);
        uint256 cap = vm.envOr("CAP", uint256(3_000_000)) * 1 ether;

        vm.startBroadcast();

        if (usdg == address(0)) {
            usdg = address(new MockERC20("Global Dollar (mock)", "USDG", 6));
            console2.log("MockERC20 USDG:", usdg);
        }
        if (nvda == address(0)) {
            nvda = address(new MockERC20("NVIDIA (mock)", "NVDA", 18));
            console2.log("MockERC20 NVDA:", nvda);
        }
        // Swap router. If SWAP_ROUTER is given, use it as-is. Else SWAP_MODE picks: "pons" deploys the
        // real PonsSwapAdapter (buys DRIP from its Pons bonding curve + NVDA from its Uniswap v4 pool);
        // anything else deploys the fixed-rate MockSwapRouter for testnet.
        bool mockRouter = false;
        bool ponsRouter = false;
        PonsSwapAdapter ponsAdapter;
        if (swapRouter == address(0)) {
            string memory swapMode = vm.envOr("SWAP_MODE", string("mock"));
            if (keccak256(bytes(swapMode)) == keccak256(bytes("pons"))) {
                address poolManager = vm.envOr("POOL_MANAGER", 0x8366a39CC670B4001A1121B8F6A443A643e40951);
                ponsAdapter = new PonsSwapAdapter(deployer, poolManager);
                swapRouter = address(ponsAdapter);
                ponsRouter = true;
                console2.log("PonsSwapAdapter:", swapRouter);
            } else {
                swapRouter = address(new MockSwapRouter());
                mockRouter = true;
                console2.log("MockSwapRouter:", swapRouter);
            }
        }
        // Randomness source. If RANDOMNESS is given, use it. Else RNG_MODE picks: "commit-reveal"
        // deploys the bonded CommitRevealRandomness (the mainnet path, still unaudited); anything else
        // (default) deploys MockRandomness for testnet convenience.
        bool mockRng = false;
        bool commitReveal = false;
        if (randomness == address(0)) {
            string memory rngMode = vm.envOr("RNG_MODE", string("mock"));
            if (keccak256(bytes(rngMode)) == keccak256(bytes("commit-reveal"))) {
                CommitRevealRandomness cr = new CommitRevealRandomness(deployer);
                randomness = address(cr);
                commitReveal = true;
                console2.log("CommitRevealRandomness:", randomness);
            } else {
                randomness = address(new MockRandomness());
                mockRng = true;
                console2.log("MockRandomness:", randomness);
            }
        }

        // DRIP token. Default: deploy our fixed-supply DripToken. If DRIP is given, use that existing
        // token as DRIP (e.g. a real fixed-supply, burnable ERC20 already on-chain). It MUST have
        // burn(uint256) — the reward engine burns 70% of bought DRIP each round.
        address dripAddr = vm.envOr("DRIP", address(0));
        bool externalDrip = dripAddr != address(0);
        if (!externalDrip) {
            dripAddr = address(new DripToken(cap, deployer)); // fixed supply → deployer (== the Pons launch)
        } else {
            console2.log("DripToken (existing):", dripAddr);
        }
        IERC20 drip = IERC20(dripAddr);
        StakeVault stakeVault = new StakeVault(drip);
        RefiningVault refining = new RefiningVault(drip, feeSink);
        GridMine gridMine = new GridMine(
            IERC20(usdg), drip, IERC20(nvda), refining, stakeVault, ISwapRouter(swapRouter),
            IRandomnessSource(randomness), marketing, deployer
        );

        refining.setGridMine(address(gridMine));
        if (mockRng) MockRandomness(randomness).setConsumer(address(gridMine));
        if (commitReveal) {
            // Wire the consumer; operator + bond are configured post-deploy by the owner (keeper wallet).
            CommitRevealRandomness(randomness).setConsumer(address(gridMine));
            console2.log("NOTE: set operator + fund bond + queue commitments on CommitRevealRandomness.");
        }
        // Wire the real Pons adapter to the actual venues: DRIP bought from its Pons bonding curve,
        // NVDA from its Uniswap v4 pool. Addresses default to the verified FLYCOINHUNT test config and
        // can be overridden by env. No liquidity to seed — it buys from the real pools.
        if (ponsRouter) {
            address ponsCurve = vm.envOr("PONS_CURVE", 0xa077C42F1f61e6E8F6BAef4B7B1e7e2F5D3eDf86);
            ponsAdapter.setCurve(dripAddr, ponsCurve);
            console2.log("Pons curve wired for DRIP:", ponsCurve);
            // NVDA/USDG v4 pool (from its on-chain Initialize event): dynamic fee, tickSpacing 60.
            address nvdaHook = vm.envOr("NVDA_V4_HOOK", 0xb3502dc2Fc6BaDf3f184A87Cb3e31f95FfF16181);
            (address c0, address c1) = usdg < nvda ? (usdg, nvda) : (nvda, usdg);
            ponsAdapter.setV4Pool(
                nvda,
                PoolKey({
                    currency0: c0,
                    currency1: c1,
                    fee: uint24(vm.envOr("NVDA_V4_FEE", uint256(0x800000))),
                    tickSpacing: int24(int256(vm.envOr("NVDA_V4_TICK_SPACING", uint256(60)))),
                    hooks: nvdaHook
                })
            );
            console2.log("NVDA v4 pool wired, hook:", nvdaHook);
        }

        // Seed the MOCK router with DRIP + NVDA so per-round buys have liquidity in testing. On mainnet
        // the router is the real Pons/Uniswap-v4 pool — do NOT do this. SEED_DRIP = whole DRIP tokens
        // to move from the deployer to the router (default 100k; for our own DripToken, cap/10).
        if (mockRouter) {
            // Fixed swap rate for the mock. Default 1e16 bridges 6dp USDG → 18dp DRIP/NVDA at ~$1:1
            // (out = in * 1e12), matching the tests. Override with SWAP_RATE_BPS if decimals differ.
            MockSwapRouter(swapRouter).setRate(vm.envOr("SWAP_RATE_BPS", uint256(1e16)));
            uint256 seedDrip = vm.envOr("SEED_DRIP", uint256(0)) * 1 ether;
            if (seedDrip == 0) seedDrip = externalDrip ? 100_000 ether : cap / 10;
            // Only seed if the deployer actually holds enough DRIP — checked up front so the script
            // never reverts. If it doesn't (e.g. an existing token held by another wallet), we skip
            // and the deployer sends DRIP to the router manually afterwards.
            if (IERC20(dripAddr).balanceOf(deployer) >= seedDrip) {
                IERC20(dripAddr).transfer(swapRouter, seedDrip);
                console2.log("Seeded router with DRIP:", seedDrip);
            } else {
                console2.log("SEED FAILED - send DRIP manually to the router:", swapRouter);
            }
            // Mint mock NVDA liquidity to the router (real NVDA is a fixed on-chain token).
            try MockERC20(nvda).mint(swapRouter, 1_000_000 ether) {} catch {}
        }

        vm.stopBroadcast();

        console2.log("DripToken:    ", address(drip));
        console2.log("GridMine:     ", address(gridMine));
        console2.log("RefiningVault:", address(refining));
        console2.log("StakeVault:   ", address(stakeVault));
    }
}
