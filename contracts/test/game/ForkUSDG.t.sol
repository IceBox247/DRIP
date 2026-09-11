// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {DripToken} from "../../src/game/DripToken.sol";
import {GridMine} from "../../src/game/GridMine.sol";
import {RefiningVault} from "../../src/game/RefiningVault.sol";
import {StakeVault} from "../../src/game/StakeVault.sol";
import {MockERC20} from "../../src/game/mocks/MockERC20.sol";
import {MockRandomness} from "../../src/game/mocks/MockRandomness.sol";
import {MockSwapRouter} from "../../src/game/mocks/MockSwapRouter.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {ISwapRouter} from "../../src/game/interfaces/ISwapRouter.sol";
import {IRandomnessSource} from "../../src/game/interfaces/IRandomnessSource.sol";

/// @notice Plays a Grid Mine v2 round against the REAL USDG on a Robinhood mainnet fork. Zero real
///         funds at risk (fork `deal`). The DRIP/USDG swap uses a mock router here — on mainnet it's
///         the real Pons-seeded pool.
contract ForkUSDGTest is Test {
    address constant USDG = 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168; // verified on-chain

    address marketing = makeAddr("marketing");
    address feeSink = makeAddr("feeSink");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");

    function _fork() internal returns (bool) {
        try vm.createSelectFork("https://rpc.mainnet.chain.robinhood.com") {
            return true;
        } catch {
            return false;
        }
    }

    function test_realUSDG_round() public {
        if (!_fork()) {
            emit log("fork RPC unavailable - skipping");
            return;
        }
        assertEq(block.chainid, 4663, "forked Robinhood mainnet");
        assertEq(IERC20Metadata(USDG).decimals(), 6, "real USDG");

        DripToken drip = new DripToken(3_000_000 ether, address(this));
        MockERC20 nvda = new MockERC20("NVIDIA", "NVDA", 18);
        MockRandomness rand = new MockRandomness();
        MockSwapRouter router = new MockSwapRouter();
        router.setRate(1e16); // 6dp USDG → 18dp DRIP ~1:1
        StakeVault stakeVault = new StakeVault(IERC20(address(drip)));
        RefiningVault refining = new RefiningVault(IERC20(address(drip)), feeSink);
        GridMine gridMine = new GridMine(
            IERC20(USDG), IERC20(address(drip)), IERC20(address(nvda)), refining, stakeVault,
            ISwapRouter(address(router)), IRandomnessSource(address(rand)), marketing, address(this)
        );
        refining.setGridMine(address(gridMine));
        rand.setConsumer(address(gridMine));
        drip.transfer(address(router), 1_000 ether); // seed mock pool
        nvda.mint(address(router), 1_000 ether); // seed NVDA liquidity for the winners' 4% slice

        uint256 U = 1e6;
        deal(USDG, alice, 1000 * U);
        deal(USDG, bob, 1000 * U);
        vm.prank(alice);
        IERC20(USDG).approve(address(gridMine), type(uint256).max);
        vm.prank(bob);
        IERC20(USDG).approve(address(gridMine), type(uint256).max);

        vm.startPrank(alice);
        gridMine.deploy(7, 100 * U);
        gridMine.deploy(3, 50 * U);
        vm.stopPrank();
        vm.startPrank(bob);
        gridMine.deploy(7, 100 * U);
        gridMine.deploy(10, 200 * U);
        vm.stopPrank();

        rand.setWord(65557); // tile 7, shared (not solo)
        vm.warp(block.timestamp + 61);
        gridMine.closeRound();
        gridMine.processRewards(1, 0, 0);

        assertEq(gridMine.adminAccrued(), 45 * U / 10, "1% entry fees = 4.5 real USDG");
        gridMine.withdrawMarketing();
        assertEq(IERC20(USDG).balanceOf(marketing), 45 * U / 10, "marketing 4.5 real USDG");
        uint256 aBefore = IERC20(USDG).balanceOf(alice);
        vm.prank(alice);
        gridMine.harvest(1);
        assertEq(IERC20(USDG).balanceOf(alice) - aBefore, 210375 * U / 1000, "alice 210.375 real USDG");
        assertEq(refining.claimable(alice), 7425 * 1e14, "alice DRIP 0.7425 (bought, not minted)");
        assertEq(nvda.balanceOf(alice), 495 * 1e15, "alice NVDA 0.495 (bought from the 4% slice)");
        emit log_named_uint("alice real-USDG payout (6dp)", IERC20(USDG).balanceOf(alice) - aBefore);
    }
}
