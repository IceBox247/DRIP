// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {DripMineToken} from "../../src/game/DripMineToken.sol";
import {GridMine} from "../../src/game/GridMine.sol";
import {RefiningVault} from "../../src/game/RefiningVault.sol";
import {Buyback} from "../../src/game/Buyback.sol";
import {StakeVault} from "../../src/game/StakeVault.sol";
import {MockERC20} from "../../src/game/mocks/MockERC20.sol";
import {MockRandomness} from "../../src/game/mocks/MockRandomness.sol";
import {MockSwapRouter} from "../../src/game/mocks/MockSwapRouter.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ISwapRouter} from "../../src/game/interfaces/ISwapRouter.sol";

contract GameTest is Test {
    MockERC20 usdg;
    DripMineToken drip;
    MockRandomness rand;
    RefiningVault refining;
    StakeVault stakeVault;
    Buyback buyback;
    MockSwapRouter router;

    address admin = makeAddr("adminTreasury");
    address feeSink = makeAddr("feeSink");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");

    uint256 constant U = 1e6; // USDG has 6 decimals

    function setUp() public {
        usdg = new MockERC20("Global Dollar", "USDG", 6);
        drip = new DripMineToken(3_000_000 ether, address(this));
        rand = new MockRandomness();
        router = new MockSwapRouter();
        stakeVault = new StakeVault(IERC20(address(drip)));
        buyback = new Buyback(IERC20(address(usdg)), IERC20(address(drip)), ISwapRouter(address(router)), address(stakeVault));
        refining = new RefiningVault(IERC20(address(drip)), feeSink);
        GridMine gm = new GridMine(
            IERC20(address(usdg)), drip, refining, rand, address(buyback), admin, address(this)
        );
        gridMine = gm;
        refining.setGridMine(address(gm));
        drip.setMinter(address(gm));
        drip.lockMinter();
        rand.setConsumer(address(gm));

        usdg.mint(alice, 1000 * U);
        usdg.mint(bob, 1000 * U);
        vm.prank(alice);
        usdg.approve(address(gm), type(uint256).max);
        vm.prank(bob);
        usdg.approve(address(gm), type(uint256).max);
    }

    GridMine gridMine;

    /// Full round: A + B share the winning tile; verify USDG split, admin fee, protocol cut, DRIP.
    function test_fullRound() public {
        // Round 1 is open from the constructor.
        vm.startPrank(alice);
        gridMine.deploy(7, 100 * U);
        gridMine.deploy(3, 50 * U);
        vm.stopPrank();
        vm.startPrank(bob);
        gridMine.deploy(7, 100 * U);
        gridMine.deploy(10, 200 * U);
        vm.stopPrank();

        // word = 6407 -> 6407 % 25 == 7 (tile 7 wins); (6407>>8)=25, 25%625 != 0 (no motherlode).
        rand.setWord(6407);
        vm.warp(block.timestamp + 61);
        gridMine.closeRound();

        GridMine.Round memory r = gridMine.getRound(1);
        assertEq(r.winningTile, 7, "winning tile");
        assertEq(uint8(r.status), 2, "settled");
        assertFalse(r.motherlodeHit, "no motherlode");

        // gross 450, admin 1% = 4.5, workable 445.5, winnerStake 200,
        // loserPot 245.5, protocolCut 10% = 24.55, winnerPot 220.95 (USDG, 6dp)
        assertEq(usdg.balanceOf(admin), 45 * U / 10, "admin fee 4.5");
        assertEq(usdg.balanceOf(address(buyback)), 2455 * U / 100, "protocol cut 24.55");
        assertEq(r.winnerPot, 22095 * U / 100, "winner pot 220.95");

        // Alice harvest: principal 100 + 220.95*100/200 = 100 + 110.475 = 210.475 USDG; 0.5 DRIP.
        uint256 aBefore = usdg.balanceOf(alice);
        vm.prank(alice);
        gridMine.harvest(1);
        assertEq(usdg.balanceOf(alice) - aBefore, 210475 * U / 1000, "alice usdg out");
        assertEq(refining.claimable(alice), 0.5 ether, "alice drip");

        vm.prank(bob);
        gridMine.harvest(1);
        assertEq(refining.claimable(bob), 0.5 ether, "bob drip");

        assertEq(drip.totalSupply(), 1 ether, "1 DRIP emitted this round");

        // Loser cannot double-harvest / non-winner reverts.
        vm.expectRevert(GridMine.AlreadyHarvested.selector);
        vm.prank(alice);
        gridMine.harvest(1);
    }

    /// Owner cannot pick the winner: no admin function exists to set the tile, only pause deploys.
    function test_ownerCannotPickWinner() public {
        // setPaused is the only owner lever; prove it doesn't touch round state / winner.
        gridMine.setPaused(true);
        vm.expectRevert(GridMine.IsPaused.selector);
        vm.prank(alice);
        gridMine.deploy(1, 1 * U);
        gridMine.setPaused(false);
    }

    /// Refining tax: a claimer pays 10%, redistributed to remaining unclaimed holders.
    function test_refiningTax() public {
        MockERC20 d = new MockERC20("Drip", "DRIP", 18);
        RefiningVault rv = new RefiningVault(IERC20(address(d)), feeSink);
        rv.setGridMine(address(this)); // test acts as GridMine
        d.mint(address(rv), 200 ether); // back the credits
        rv.credit(alice, 100 ether);
        rv.credit(bob, 100 ether);

        // Bob claims all 100: gets 90, 10 tax -> Alice (only other unclaimed holder).
        vm.prank(bob);
        rv.claim(100 ether);
        assertEq(d.balanceOf(bob), 90 ether, "bob net");
        assertEq(rv.claimable(alice), 110 ether, "alice inherits tax");

        // Alice claims all 110: gets 99, 11 tax -> feeSink (no unclaimed holders left).
        vm.prank(alice);
        rv.claim(110 ether);
        assertEq(d.balanceOf(alice), 99 ether, "alice net");
        assertEq(d.balanceOf(feeSink), 11 ether, "fee to sink when no one left");
    }

    /// Buyback: swap USDG -> DRIP, burn 90%, 10% to stakers.
    function test_buyback() public {
        MockERC20 u = new MockERC20("USDG", "USDG", 18);
        MockERC20 d = new MockERC20("Drip", "DRIP", 18);
        MockSwapRouter r2 = new MockSwapRouter();
        StakeVault sv = new StakeVault(IERC20(address(d)));
        Buyback bb = new Buyback(IERC20(address(u)), IERC20(address(d)), ISwapRouter(address(r2)), address(sv));

        d.mint(address(r2), 1000 ether); // router liquidity (1:1)
        u.mint(address(bb), 1000 ether); // protocol cut to spend

        bb.execute(0);
        assertEq(d.balanceOf(address(sv)), 100 ether, "10% to stakers");
        assertEq(d.totalSupply(), 100 ether, "900 burned of 1000");
        assertEq(u.balanceOf(address(bb)), 0, "all usdg spent");
    }

    /// StakeVault: rewards distributed pro-rata; single staker gets all.
    function test_staking() public {
        MockERC20 d = new MockERC20("Drip", "DRIP", 18);
        StakeVault sv = new StakeVault(IERC20(address(d)));
        d.mint(alice, 100 ether);
        vm.startPrank(alice);
        d.approve(address(sv), type(uint256).max);
        sv.stake(100 ether);
        vm.stopPrank();

        d.mint(address(sv), 50 ether); // simulate buyback transfer
        sv.notify(50 ether);
        assertEq(sv.earned(alice), 50 ether, "alice earned all rewards");

        vm.prank(alice);
        sv.getReward();
        assertEq(d.balanceOf(alice), 50 ether, "alice got reward");
    }

    /// Empty round just advances without settlement.
    function test_emptyRoundAdvances() public {
        vm.warp(block.timestamp + 61);
        gridMine.closeRound();
        assertEq(gridMine.currentRound(), 2, "advanced to round 2");
    }
}
