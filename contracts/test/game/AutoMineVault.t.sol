// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {DripToken} from "../../src/game/DripToken.sol";
import {GridMine} from "../../src/game/GridMine.sol";
import {AutoMineVault, IGridMineDeployFor} from "../../src/game/AutoMineVault.sol";
import {RefiningVault} from "../../src/game/RefiningVault.sol";
import {StakeVault} from "../../src/game/StakeVault.sol";
import {MockERC20} from "../../src/game/mocks/MockERC20.sol";
import {MockRandomness} from "../../src/game/mocks/MockRandomness.sol";
import {MockSwapRouter} from "../../src/game/mocks/MockSwapRouter.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ISwapRouter} from "../../src/game/interfaces/ISwapRouter.sol";
import {IRandomnessSource} from "../../src/game/interfaces/IRandomnessSource.sol";

contract AutoMineVaultTest is Test {
    MockERC20 usdg;
    DripToken drip;
    MockERC20 nvda;
    MockRandomness rand;
    RefiningVault refining;
    StakeVault stakeVault;
    MockSwapRouter router;
    GridMine gridMine;
    AutoMineVault vault;

    address marketing = makeAddr("marketing");
    address feeSink = makeAddr("feeSink");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address keeper = makeAddr("keeper");

    uint256 constant U = 1e6; // USDG 6 decimals
    uint256 constant RATE = 1e16;
    uint256 constant NET = (99 * U) / 10; // net after the 1% entry fee on a 10 USDG per-block deploy

    function setUp() public {
        usdg = new MockERC20("Global Dollar", "USDG", 6);
        drip = new DripToken(3_000_000 ether, address(this));
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
        drip.transfer(address(router), 1_000 ether);
        nvda.mint(address(router), 1_000 ether);

        vault = new AutoMineVault(IERC20(address(usdg)), IGridMineDeployFor(address(gridMine)));
        gridMine.setOperator(address(vault), true);

        usdg.mint(alice, 1000 * U);
        usdg.mint(bob, 1000 * U);
        vm.prank(alice);
        usdg.approve(address(vault), type(uint256).max);
        vm.prank(bob);
        usdg.approve(address(gridMine), type(uint256).max);
    }

    function _tiles(uint8 a, uint8 b) internal pure returns (uint8[] memory t) {
        t = new uint8[](2);
        t[0] = a;
        t[1] = b;
    }

    function test_configure_pullsExactDeposit() public {
        vm.prank(alice);
        vault.configure(_tiles(7, 3), 10 * U, 5); // 10 × 2 blocks × 5 rounds = 100 USDG
        assertEq(usdg.balanceOf(address(vault)), 100 * U, "vault holds the full deposit");
        (uint8[] memory t, uint256 perTile, uint32 roundsLeft, uint256 bal,) = vault.planOf(alice);
        assertEq(t.length, 2);
        assertEq(perTile, 10 * U);
        assertEq(roundsLeft, 5);
        assertEq(bal, 100 * U);
        assertTrue(vault.isActive(alice));
    }

    function test_executeFor_creditsPlayerNotVault() public {
        vm.prank(alice);
        vault.configure(_tiles(7, 3), 10 * U, 5);

        vm.prank(keeper);
        assertTrue(vault.executeFor(alice));

        // Stake is credited to ALICE (net of the 1% fee), never to the vault.
        assertEq(gridMine.stakeOf(1, 7, alice), NET, "alice credited on block 7");
        assertEq(gridMine.stakeOf(1, 3, alice), NET, "alice credited on block 3");
        assertEq(gridMine.stakeOf(1, 7, address(vault)), 0, "vault never holds a stake");

        (, , uint32 roundsLeft, uint256 bal,) = vault.planOf(alice);
        assertEq(roundsLeft, 4, "one round consumed");
        assertEq(bal, 80 * U, "20 USDG gross spent this round");
        assertEq(usdg.balanceOf(address(vault)), 80 * U);
    }

    function test_executeFor_atMostOncePerRound() public {
        vm.prank(alice);
        vault.configure(_tiles(7, 3), 10 * U, 5);
        vm.prank(keeper);
        assertTrue(vault.executeFor(alice));
        // Second poke in the same round window does nothing (no double deploy, no revert).
        vm.prank(keeper);
        assertFalse(vault.executeFor(alice));
        assertEq(gridMine.stakeOf(1, 7, alice), NET, "still only one deploy");
    }

    function test_executeFor_rollsIntoNextRound() public {
        vm.prank(alice);
        vault.configure(_tiles(7, 3), 10 * U, 5);
        vm.prank(keeper);
        vault.executeFor(alice); // round 1

        rand.setWord(1); // let the elapsed round settle when the next deploy rolls it
        vm.warp(block.timestamp + 61);
        vm.prank(keeper);
        assertTrue(vault.executeFor(alice));
        assertEq(gridMine.currentRound(), 2, "rolled into round 2");
        assertEq(gridMine.stakeOf(2, 7, alice), NET, "alice credited in round 2");
    }

    function test_winnings_goToPlayer() public {
        // Alice auto-mines block 7; bob mines block 3 (the loser). Block 7 wins → alice harvests USDG.
        uint8[] memory one = new uint8[](1);
        one[0] = 7;
        vm.prank(alice);
        vault.configure(one, 100 * U, 1);
        vm.prank(keeper);
        vault.executeFor(alice);

        vm.prank(bob);
        gridMine.deploy(3, 100 * U);

        rand.setWord(65557); // winning tile 7 (65557 % 25 == 7), shared (bit16 set → not solo)
        vm.warp(block.timestamp + 61);
        gridMine.closeRound();

        uint256 before = usdg.balanceOf(alice);
        vm.prank(alice);
        gridMine.harvest(1);
        assertGt(usdg.balanceOf(alice), before, "alice (not the vault) receives the winnings");
        assertEq(usdg.balanceOf(address(vault)), 0, "vault holds no winnings");
    }

    function test_withdraw_refundsAndStops() public {
        vm.prank(alice);
        vault.configure(_tiles(7, 3), 10 * U, 5); // 100 deposited
        uint256 before = usdg.balanceOf(alice);
        vm.prank(alice);
        vault.withdraw();
        assertEq(usdg.balanceOf(alice), before + 100 * U, "unspent USDG refunded");
        (, , uint32 roundsLeft, uint256 bal,) = vault.planOf(alice);
        assertEq(roundsLeft, 0, "plan stopped");
        assertEq(bal, 0);
        assertFalse(vault.isActive(alice));
    }

    function test_deployManyFor_onlyOperator() public {
        uint8[] memory t = new uint8[](1);
        t[0] = 1;
        uint256[] memory a = new uint256[](1);
        a[0] = 1 * U;
        vm.expectRevert(GridMine.NotOperator.selector);
        vm.prank(alice);
        gridMine.deployManyFor(alice, t, a);
    }

    function test_executeFor_stopsWhenOutOfFunds() public {
        // Fund exactly one round, then set roundsLeft high by reconfigure isn't needed — just run twice.
        uint8[] memory one = new uint8[](1);
        one[0] = 7;
        vm.prank(alice);
        vault.configure(one, 10 * U, 1); // funds 1 round only
        vm.prank(keeper);
        assertTrue(vault.executeFor(alice));
        // roundsLeft now 0 → further pokes do nothing.
        rand.setWord(1);
        vm.warp(block.timestamp + 61);
        vm.prank(keeper);
        assertFalse(vault.executeFor(alice));
    }
}
