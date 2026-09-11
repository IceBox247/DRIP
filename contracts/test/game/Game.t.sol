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
import {ISwapRouter} from "../../src/game/interfaces/ISwapRouter.sol";
import {IRandomnessSource} from "../../src/game/interfaces/IRandomnessSource.sol";

contract GameTest is Test {
    MockERC20 usdg;
    DripToken drip;
    MockERC20 nvda;
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
        nvda = new MockERC20("NVIDIA", "NVDA", 18);
        rand = new MockRandomness();
        router = new MockSwapRouter();
        router.setRate(RATE);
        stakeVault = new StakeVault(IERC20(address(drip)));
        refining = new RefiningVault(IERC20(address(drip)), feeSink);
        gridMine = new GridMine(
            IERC20(address(usdg)), IERC20(address(drip)), IERC20(address(nvda)), refining, stakeVault,
            ISwapRouter(address(router)), IRandomnessSource(address(rand)), marketing, address(this)
        );
        refining.setGridMine(address(gridMine));
        rand.setConsumer(address(gridMine));
        drip.transfer(address(router), 1_000 ether); // seed the swap pool (mock)
        nvda.mint(address(router), 1_000 ether); // seed NVDA liquidity for the winners' 4% slice

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

        rand.setWord(65557); // tile 7, no motherlode, SHARED (bit16 set → not solo)
        vm.warp(block.timestamp + 61);
        gridMine.closeRound(); // settles round 1

        // 1% entry fee skimmed at deploy: gross deployed 450 → adminAccrued 4.5, net pool 445.5.
        // winnerStake (net) 198; loserPot 247.5; cut 24.75; winnerPot 222.75.
        assertEq(gridMine.adminAccrued(), 45 * U / 10, "1% entry fees accrued = 4.5 USDG");
        gridMine.withdrawMarketing();
        assertEq(usdg.balanceOf(marketing), 45 * U / 10, "marketing receives 4.5 USDG");
        GridMine.Round memory r = gridMine.getRound(1);
        assertEq(r.winningTile, 7);
        assertEq(r.cutUsdg, 2475 * U / 100, "cut 24.75 USDG parked");

        // Buy DRIP with the cut + distribute (keeper step).
        uint256 supplyBefore = drip.totalSupply();
        gridMine.processRewards(1, 0, 0);

        // Cut 24.75 USDG apportioned: 70% burn=17.325, 10% stakers=2.475, 10% motherlode=2.475,
        // 6% winners-DRIP=1.485 (buys DRIP from 96% = 23.76 USDG); 4% winners-NVDA=0.99 USDG → 0.99 NVDA.
        assertEq(drip.balanceOf(address(stakeVault)), 2475 * 1e15, "stakers 2.475 DRIP");
        assertEq(gridMine.motherlodeDrip(), 2475 * 1e15, "motherlode 2.475 DRIP");
        assertEq(supplyBefore - drip.totalSupply(), 17325 * 1e15, "burned 17.325 DRIP");

        // Harvest USDG then DRIP + NVDA.
        uint256 aBefore = usdg.balanceOf(alice);
        vm.prank(alice);
        gridMine.harvest(1); // pays USDG + credits DRIP + pays NVDA (rewards already processed)
        assertEq(usdg.balanceOf(alice) - aBefore, 210375 * U / 1000, "alice USDG 210.375 (net principal + pot)");
        assertEq(refining.claimable(alice), 7425 * 1e14, "alice DRIP 0.7425 (half of 1.485)");
        assertEq(nvda.balanceOf(alice), 495 * 1e15, "alice NVDA 0.495 (half of 0.99)");

        vm.prank(bob);
        gridMine.harvest(1);
        assertEq(refining.claimable(bob), 7425 * 1e14, "bob DRIP 0.7425");
        assertEq(nvda.balanceOf(bob), 495 * 1e15, "bob NVDA 0.495");
    }

    function test_soloWinnerTakesAllDrip() public {
        // Same deploys as the full round, but a SOLO word (bit16 clear) with ticket 0 → the first
        // depositor on the winning tile (alice) takes ALL the round DRIP; bob gets none.
        vm.startPrank(alice);
        gridMine.deploy(7, 100 * U);
        gridMine.deploy(3, 50 * U);
        vm.stopPrank();
        vm.startPrank(bob);
        gridMine.deploy(7, 100 * U);
        gridMine.deploy(10, 200 * U);
        vm.stopPrank();

        rand.setWord(1007); // tile 7, no motherlode, SOLO (bit16 clear), ticket 0 → alice
        vm.warp(block.timestamp + 61);
        gridMine.closeRound();
        GridMine.Round memory r = gridMine.getRound(1);
        assertTrue(r.soloMode, "solo mode");
        assertEq(r.soloWinner, alice, "alice is the weighted solo winner (ticket 0)");

        gridMine.processRewards(1, 0, 0);
        vm.prank(alice);
        gridMine.harvest(1);
        vm.prank(bob);
        gridMine.harvest(1);

        // DRIP + NVDA: alice gets it all (1.485 DRIP, 0.99 NVDA), bob none. USDG pot still shared.
        assertEq(refining.claimable(alice), 1485 * 1e15, "alice takes all DRIP");
        assertEq(nvda.balanceOf(alice), 99 * 1e16, "alice takes all NVDA (0.99)");
        assertEq(refining.claimable(bob), 0, "bob gets no DRIP in solo mode");
        assertEq(nvda.balanceOf(bob), 0, "bob gets no NVDA in solo mode");
        assertEq(usdg.balanceOf(bob), (1000 - 300) * U + 210375 * U / 1000, "bob still gets USDG pot share");
    }

    function test_soloPlayerWinsPrincipalBack() public {
        // Only alice plays and covers the winning tile → loser pot is 0 → no cut, no DRIP, no
        // win/loss. She gets her NET stake back; the only cost is the flat 1% entry fee taken at
        // deploy. (Answers: "I'm the only one and I picked the winning block.")
        vm.prank(alice);
        gridMine.deploy(7, 100 * U); // 1 USDG entry fee, 99 into the pool
        rand.setWord(65557); // tile 7
        vm.warp(block.timestamp + 61);
        gridMine.closeRound();
        gridMine.processRewards(1, 0, 0);
        vm.prank(alice);
        gridMine.harvest(1);
        assertEq(usdg.balanceOf(alice), 999 * U, "alone + won: net stake back (only the 1% entry fee)");
        assertEq(refining.claimable(alice), 0, "no DRIP (nothing was bought)");
        assertEq(gridMine.adminAccrued(), 1 * U, "1% entry fee (1 USDG) accrued to marketing");
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
        gridMine.processRewards(1, 0, 0);
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

    function test_deployMany_oneTx() public {
        uint8[] memory tiles = new uint8[](3);
        uint256[] memory amts = new uint256[](3);
        tiles[0] = 1; tiles[1] = 7; tiles[2] = 12;
        amts[0] = 10 * U; amts[1] = 20 * U; amts[2] = 30 * U;
        vm.prank(alice);
        gridMine.deployMany(tiles, amts); // single transaction, three tiles

        // Net after 1% fee: 9.9 / 19.8 / 29.7 USDG staked; 0.6 total admin.
        assertEq(gridMine.tileTotal(1, 1), 99 * U / 10, "tile 1 net 9.9");
        assertEq(gridMine.tileTotal(1, 7), 198 * U / 10, "tile 7 net 19.8");
        assertEq(gridMine.tileTotal(1, 12), 297 * U / 10, "tile 12 net 29.7");
        assertEq(gridMine.adminAccrued(), 6 * U / 10, "1% of 60 = 0.6 USDG");
    }

    function test_deployMany_rejectsBadInput() public {
        uint8[] memory tiles = new uint8[](2);
        uint256[] memory amts = new uint256[](1);
        tiles[0] = 1; tiles[1] = 2; amts[0] = 10 * U;
        vm.prank(alice);
        vm.expectRevert(GridMine.BadInput.selector);
        gridMine.deployMany(tiles, amts);
    }

    function test_emptyRoundWaitsForFirstDeploy() public {
        // Clock only starts on the first deploy — an empty round has no window to close.
        assertEq(gridMine.timeLeft(), 60, "full clock shown, not counting");
        vm.warp(block.timestamp + 120);
        vm.expectRevert(GridMine.WindowNotElapsed.selector);
        gridMine.closeRound();
        assertEq(gridMine.currentRound(), 1, "still round 1 - nobody deployed");
    }

    function test_deployRollsOverFinishedRound() public {
        // Round flows with NO keeper and NO button: deploying into a finished round settles it and
        // opens a fresh one, all in the deploy tx.
        vm.prank(alice);
        gridMine.deploy(7, 100 * U); // starts the clock for round 1
        assertEq(gridMine.currentRound(), 1);

        rand.setWord(65557); // tile 7 wins round 1
        vm.warp(block.timestamp + 61); // round 1's window elapses

        vm.prank(bob);
        gridMine.deploy(3, 50 * U); // rolls round 1 over, lands in round 2

        assertEq(gridMine.currentRound(), 2, "auto-advanced to round 2");
        GridMine.Round memory r1 = gridMine.getRound(1);
        assertEq(uint8(r1.status), 2, "round 1 settled");
        assertEq(r1.winningTile, 7, "round 1 winner picked");
        assertEq(gridMine.tileTotal(2, 3), 495 * U / 10, "bob's 49.5 net landed in round 2");
    }
}
