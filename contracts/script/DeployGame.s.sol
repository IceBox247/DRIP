// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {DripMineToken} from "../src/game/DripMineToken.sol";
import {GridMine} from "../src/game/GridMine.sol";
import {RefiningVault} from "../src/game/RefiningVault.sol";
import {Buyback} from "../src/game/Buyback.sol";
import {StakeVault} from "../src/game/StakeVault.sol";
import {ISwapRouter} from "../src/game/interfaces/ISwapRouter.sol";
import {IRandomnessSource} from "../src/game/interfaces/IRandomnessSource.sol";
import {MockERC20} from "../src/game/mocks/MockERC20.sol";
import {MockRandomness} from "../src/game/mocks/MockRandomness.sol";
import {MockSwapRouter} from "../src/game/mocks/MockSwapRouter.sol";

/// @notice Deploy + wire the Grid Mine game. TESTNET (46630) ONLY — see docs/BLOCKERS.md #4.
///
/// Env (all optional on testnet; mocks are deployed when an address is 0):
///   USDG           - deploy asset (Robinhood USDG 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168)
///   SWAP_ROUTER    - Uniswap v4 adapter for Buyback (0 => MockSwapRouter)
///   RANDOMNESS     - IRandomnessSource (VRF/commit-reveal; 0 => MockRandomness)
///   ADMIN_TREASURY - receives the 1% admin fee (default: broadcaster)
///   FEE_SINK       - refining fee when no unclaimed holders (default: broadcaster)
///   CAP            - DRIP hard cap in whole tokens (default 3_000_000)
///
/// Usage:
///   forge script script/DeployGame.s.sol --rpc-url rhc_testnet --broadcast
contract DeployGame is Script {
    function run() external {
        address deployer = msg.sender;
        address usdg = vm.envOr("USDG", address(0));
        address swapRouter = vm.envOr("SWAP_ROUTER", address(0));
        address randomness = vm.envOr("RANDOMNESS", address(0));
        address adminTreasury = vm.envOr("ADMIN_TREASURY", deployer);
        address feeSink = vm.envOr("FEE_SINK", deployer);
        uint256 cap = vm.envOr("CAP", uint256(3_000_000)) * 1 ether;

        vm.startBroadcast();

        if (usdg == address(0)) {
            usdg = address(new MockERC20("Global Dollar (mock)", "USDG", 6));
            console2.log("Deployed MockERC20 USDG:", usdg);
        }
        if (swapRouter == address(0)) {
            swapRouter = address(new MockSwapRouter());
            console2.log("Deployed MockSwapRouter:", swapRouter);
        }
        bool usedMockRandomness = randomness == address(0);
        if (usedMockRandomness) {
            randomness = address(new MockRandomness());
            console2.log("Deployed MockRandomness:", randomness);
        }

        DripMineToken drip = new DripMineToken(cap, deployer);
        StakeVault stakeVault = new StakeVault(IERC20(address(drip)));
        Buyback buyback =
            new Buyback(IERC20(usdg), IERC20(address(drip)), ISwapRouter(swapRouter), address(stakeVault));
        RefiningVault refining = new RefiningVault(IERC20(address(drip)), feeSink);
        GridMine gridMine = new GridMine(
            IERC20(usdg), drip, refining, IRandomnessSource(randomness), address(buyback), adminTreasury, deployer
        );

        // Wire the cycle.
        refining.setGridMine(address(gridMine));
        drip.setMinter(address(gridMine));
        drip.lockMinter();
        // Only the mock needs its consumer pointed here; real sources configure their own way.
        if (usedMockRandomness) MockRandomness(randomness).setConsumer(address(gridMine));

        vm.stopBroadcast();

        console2.log("DripMineToken:", address(drip));
        console2.log("GridMine:     ", address(gridMine));
        console2.log("RefiningVault:", address(refining));
        console2.log("Buyback:      ", address(buyback));
        console2.log("StakeVault:   ", address(stakeVault));
    }
}
