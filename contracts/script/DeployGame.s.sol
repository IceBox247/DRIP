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
        bool mockRouter = swapRouter == address(0);
        if (mockRouter) {
            swapRouter = address(new MockSwapRouter());
            console2.log("MockSwapRouter:", swapRouter);
        }
        bool mockRng = randomness == address(0);
        if (mockRng) {
            randomness = address(new MockRandomness());
            console2.log("MockRandomness:", randomness);
        }

        DripToken drip = new DripToken(cap, deployer); // fixed supply → deployer (== the Pons launch)
        StakeVault stakeVault = new StakeVault(IERC20(address(drip)));
        RefiningVault refining = new RefiningVault(IERC20(address(drip)), feeSink);
        GridMine gridMine = new GridMine(
            IERC20(usdg), IERC20(address(drip)), IERC20(nvda), refining, stakeVault, ISwapRouter(swapRouter),
            IRandomnessSource(randomness), marketing, deployer
        );

        refining.setGridMine(address(gridMine));
        if (mockRng) MockRandomness(randomness).setConsumer(address(gridMine));
        // Seed the MOCK router with DRIP + NVDA so per-round buys have liquidity in testing. On mainnet
        // the router is the real Pons/Uniswap-v4 pool — do NOT do this.
        if (mockRouter) {
            drip.transfer(swapRouter, cap / 10);
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
