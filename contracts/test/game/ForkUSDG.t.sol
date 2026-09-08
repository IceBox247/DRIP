// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {DripMineToken} from "../../src/game/DripMineToken.sol";
import {GridMine} from "../../src/game/GridMine.sol";
import {RefiningVault} from "../../src/game/RefiningVault.sol";
import {Buyback} from "../../src/game/Buyback.sol";
import {StakeVault} from "../../src/game/StakeVault.sol";
import {MockRandomness} from "../../src/game/mocks/MockRandomness.sol";
import {MockSwapRouter} from "../../src/game/mocks/MockSwapRouter.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {ISwapRouter} from "../../src/game/interfaces/ISwapRouter.sol";

/// @notice Plays a Grid Mine round against the REAL USDG on a Robinhood mainnet fork — proves the
///         game behaves correctly with the real token, with zero real funds at risk.
/// @dev Runs only when a fork is available (RHC_MAINNET_RPC_URL env or the literal RPC). Skips
///      cleanly otherwise so the normal suite isn't affected.
contract ForkUSDGTest is Test {
    address constant USDG = 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168; // real, verified on-chain

    GridMine gridMine;
    RefiningVault refining;
    DripMineToken drip;
    address admin = makeAddr("admin");
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
        assertEq(IERC20Metadata(USDG).decimals(), 6, "real USDG, 6 decimals");

        // Deploy the game pointed at the REAL USDG.
        drip = new DripMineToken(3_000_000 ether, address(this));
        MockRandomness rand = new MockRandomness();
        MockSwapRouter router = new MockSwapRouter();
        StakeVault stakeVault = new StakeVault(IERC20(address(drip)));
        Buyback buyback =
            new Buyback(IERC20(USDG), IERC20(address(drip)), ISwapRouter(address(router)), address(stakeVault));
        refining = new RefiningVault(IERC20(address(drip)), admin);
        gridMine = new GridMine(IERC20(USDG), drip, refining, rand, address(buyback), admin, address(this));
        refining.setGridMine(address(gridMine));
        drip.setMinter(address(gridMine));
        drip.lockMinter();
        rand.setConsumer(address(gridMine));

        uint256 U = 1e6; // 6 decimals
        // Give players REAL USDG balance via the fork cheatcode (locates the token's balance slot).
        deal(USDG, alice, 1000 * U);
        deal(USDG, bob, 1000 * U);
        assertEq(IERC20(USDG).balanceOf(alice), 1000 * U, "alice funded with real USDG");

        vm.prank(alice);
        IERC20(USDG).approve(address(gridMine), type(uint256).max);
        vm.prank(bob);
        IERC20(USDG).approve(address(gridMine), type(uint256).max);

        // Round 1: A 100 on tile 7 + 50 on 3; B 100 on tile 7 + 200 on 10.
        vm.startPrank(alice);
        gridMine.deploy(7, 100 * U);
        gridMine.deploy(3, 50 * U);
        vm.stopPrank();
        vm.startPrank(bob);
        gridMine.deploy(7, 100 * U);
        gridMine.deploy(10, 200 * U);
        vm.stopPrank();

        rand.setWord(6407); // tile 7 wins, no motherlode
        vm.warp(block.timestamp + 61);
        gridMine.closeRound();

        GridMine.Round memory r = gridMine.getRound(1);
        assertEq(r.winningTile, 7, "tile 7 won");

        uint256 aBefore = IERC20(USDG).balanceOf(alice);
        vm.prank(alice);
        gridMine.harvest(1);
        // principal 100 + winnerPot(220.95)*100/200 = 210.475 real USDG
        assertEq(IERC20(USDG).balanceOf(alice) - aBefore, 210475 * U / 1000, "alice real USDG payout");
        assertEq(refining.claimable(alice), 0.5 ether, "alice DRIP");
        assertEq(IERC20(USDG).balanceOf(admin), 45 * U / 10, "admin 4.5 real USDG");
        assertEq(IERC20(USDG).balanceOf(address(buyback)), 2455 * U / 100, "buyback 24.55 real USDG");

        emit log_named_uint("alice real-USDG gain (6dp)", IERC20(USDG).balanceOf(alice) - (aBefore - 0));
    }
}
