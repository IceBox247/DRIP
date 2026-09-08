// SPDX-License-Identifier: UNLICENSED
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
import {ISwapRouter} from "../../src/game/interfaces/ISwapRouter.sol";
import {IRandomnessSource} from "../../src/game/interfaces/IRandomnessSource.sol";

contract GameTest is Test {
    MockERC20 usdg;
    DripToken drip;
    MockRandomness rand;
    RefiningVault refining;
    StakeVault stakeVault;
    MockSwapRouter router;
    GridMine gridMine;

    address marketing = makeAddr("marketing");
    address feeSink = makeAddr("feeSink");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");

    uint256 constant U = 1e6; // USDG 6 decimals
    // MockSwapRouter: out = in * rateBps / 10_000. 1e16 → out = in * 1e12 (bridges 6dp USDG → 18dp
    // DRIP at a ~$1:1 price), so e.g. 24.55 USDG (24_550_000) → 24.55 DRIP (24.55e18).
    uint256 constant RATE = 1e16;

    function setUp() public {
        usdg = new MockERC20("Global Dollar", "USDG", 6);
        drip = new DripToken(3_000_000 ether, address(this)); // fixed supply → this test holds it
        rand = new MockRandomness();
        router = new MockSwapRouter();
        router.setRate(RATE);
        stakeVault = new StakeVault(IERC20(address(drip)));
        refining = new RefiningVault(IERC20(address(drip)), feeSink);
        gridMine = new GridMine(
            IERC20(address(usdg)), IERC20(address(drip)), refining, stakeVault, ISwapRouter(address(router)),
            IRandomnessSource(address(rand)), marketing, address(this)
        );
        refining.setGridMine(address(gridMine));
        rand.setConsumer(address(gridMine));
        drip.transfer(address(router), 1_000 ether); // seed the swap pool (mock)

        usdg.mint(alice, 1000 * U);
        usdg.mint(bob, 1000 * U);
        vm.prank(alice);
        usdg.approve(address(gridMine), type(uint256).max);
        vm.prank(bob);
        usdg.approve(address(gridMine), type(uint256).max);
    }

    function test_fullRound_boughtRewards() public {
        vm.startPrank(alice);
        gridMine.deploy(7, 100 * U);
        gridMine.deploy(3, 50 * U);
        vm.stopPrank();
        vm.startPrank(bob);
        gridMine.deploy(7, 100 * U);
        gridMine.deploy(10, 200 * U);
        vm.stopPrank();

        rand.setWord(6407); // tile 7, no motherlode
        vm.warp(block.timestamp + 61);
        gridMine.closeRound(); // settles round 1

        // USDG: gross 450, admin 1% = 4.5 → marketing; winnerStake 200; loserPot 245.5;
        // cut 24.55 (to swap); winnerPot 220.95.
        assertEq(usdg.balanceOf(marketing), 45 * U / 10, "marketing 4.5 USDG");
        GridMine.Round memory r = gridMine.getRound(1);
        assertEq(r.winningTile, 7);
        assertEq(r.cutUsdg, 2455 * U / 100, "cut 24.55 USDG parked");

        // Buy DRIP with the cut + distribute (keeper step).
        uint256 supplyBefore = drip.totalSupply();
        gridMine.processRewards(1, 0);

        // 24.55 USDG → 24.55 DRIP. Split: 70% burn=17.185, 10% stakers=2.455, 10% winners=2.455,
        // 10% motherlode=2.455.
        assertEq(drip.balanceOf(address(stakeVault)), 2455 * 1e15, "stakers 2.455 DRIP");
        assertEq(gridMine.motherlodeDrip(), 2455 * 1e15, "motherlode 2.455 DRIP");
        assertEq(supplyBefore - drip.totalSupply(), 17185 * 1e15, "burned 17.185 DRIP");

        // Harvest USDG then DRIP.
        uint256 aBefore = usdg.balanceOf(alice);
        vm.prank(alice);
        gridMine.harvest(1); // pays USDG + credits DRIP (rewards already processed)
        assertEq(usdg.balanceOf(alice) - aBefore, 210475 * U / 1000, "alice USDG 210.475");
        assertEq(refining.claimable(alice), 12275 * 1e14, "alice DRIP 1.2275 (half of 2.455)");

        vm.prank(bob);
        gridMine.harvest(1);
        assertEq(refining.claimable(bob), 12275 * 1e14, "bob DRIP 1.2275");
    }

    function test_nothingIsMinted() public {
        // Supply only ever goes down (burns), never up — no mint path exists.
        uint256 supply0 = drip.totalSupply();
        vm.startPrank(alice);
        gridMine.deploy(7, 100 * U);
        vm.stopPrank();
        vm.prank(bob);
        gridMine.deploy(7, 100 * U);
        rand.setWord(6407);
        vm.warp(block.timestamp + 61);
        gridMine.closeRound();
        gridMine.processRewards(1, 0);
        assertLe(drip.totalSupply(), supply0, "supply never increases");
    }

    function test_ownerCannotPickWinner() public {
        gridMine.setPaused(true);
        vm.expectRevert(GridMine.IsPaused.selector);
        vm.prank(alice);
        gridMine.deploy(1, 1 * U);
    }

    function test_refiningTax() public {
        MockERC20 d = new MockERC20("Drip", "DRIP", 18);
        RefiningVault rv = new RefiningVault(IERC20(address(d)), feeSink);
        rv.setGridMine(address(this));
        d.mint(address(rv), 200 ether);
        rv.credit(alice, 100 ether);
        rv.credit(bob, 100 ether);

        vm.prank(bob);
        rv.claim(100 ether);
        assertEq(d.balanceOf(bob), 90 ether, "bob net 90 (10% tax)");
        assertEq(rv.claimable(alice), 110 ether, "alice inherits the 10 tax");

        vm.prank(alice);
        rv.claim(110 ether);
        assertEq(d.balanceOf(alice), 99 ether, "alice net 99");
        assertEq(d.balanceOf(feeSink), 11 ether, "fee to sink when no one left");
    }

    function test_staking() public {
        MockERC20 d = new MockERC20("Drip", "DRIP", 18);
        StakeVault sv = new StakeVault(IERC20(address(d)));
        d.mint(alice, 100 ether);
        vm.startPrank(alice);
        d.approve(address(sv), type(uint256).max);
        sv.stake(100 ether);
        vm.stopPrank();
        d.mint(address(sv), 50 ether);
        sv.notify(50 ether);
        assertEq(sv.earned(alice), 50 ether, "alice earned all rewards");
    }

    function test_emptyRoundAdvances() public {
        vm.warp(block.timestamp + 61);
        gridMine.closeRound();
        assertEq(gridMine.currentRound(), 2, "advanced");
    }
}
