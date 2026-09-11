// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {PonsSwapAdapter} from "../../src/game/PonsSwapAdapter.sol";
import {MockPonsCurve} from "../../src/game/mocks/MockPonsCurve.sol";
import {MockERC20} from "../../src/game/mocks/MockERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract PonsAdapterTest is Test {
    MockERC20 usdg; // 6dp quote (like real USDG)
    MockERC20 drip; // 18dp reward token (like FLYCOINHUNT)
    MockPonsCurve curve;
    PonsSwapAdapter adapter;

    address owner = makeAddr("owner");
    address game = makeAddr("game"); // stands in for GridMine, the swap caller

    uint256 constant U = 1e6;
    uint256 constant RATE = 1e18; // out = in*rate/1e6 => in*1e12, bridging 6dp USDG -> 18dp token at ~1:1

    function setUp() public {
        usdg = new MockERC20("Global Dollar", "USDG", 6);
        drip = new MockERC20("Fly", "FLY", 18);
        curve = new MockPonsCurve(address(drip), address(usdg), RATE);
        drip.mint(address(curve), 1_000_000 ether); // curve's sellable supply

        vm.prank(owner);
        adapter = new PonsSwapAdapter(owner, address(0xDEAD)); // poolManager unused in curve-only tests
        vm.prank(owner);
        adapter.setCurve(address(drip), address(curve));

        usdg.mint(game, 1000 * U);
    }

    function _swap(uint256 amt, uint256 minOut) internal returns (uint256) {
        vm.startPrank(game);
        usdg.approve(address(adapter), amt);
        uint256 out = adapter.swapExactIn(address(usdg), address(drip), amt, minOut);
        vm.stopPrank();
        return out;
    }

    function test_buysFromCurveToCaller() public {
        uint256 out = _swap(100 * U, 0);
        assertEq(out, 100 ether, "100 USDG -> 100 FLY at 1:1");
        assertEq(drip.balanceOf(game), 100 ether, "reward landed on the caller (GridMine)");
        assertEq(usdg.balanceOf(address(curve)), 100 * U, "curve took the USDG");
        assertEq(usdg.balanceOf(address(adapter)), 0, "adapter holds nothing");
    }

    function test_slippageEnforced() public {
        vm.startPrank(game);
        usdg.approve(address(adapter), 100 * U);
        vm.expectRevert(bytes("slippage"));
        adapter.swapExactIn(address(usdg), address(drip), 100 * U, 101 ether); // demand > 100 FLY
        vm.stopPrank();
    }

    function test_partialFillRefundsRemainder() public {
        curve.setFillBps(6000); // only 60% fills
        uint256 out = _swap(100 * U, 0);
        assertEq(out, 60 ether, "60% filled -> 60 FLY");
        assertEq(usdg.balanceOf(game), 900 * U + 40 * U, "unspent 40 USDG refunded to caller");
        assertEq(usdg.balanceOf(address(adapter)), 0, "no dust left in adapter");
    }

    function test_graduatedWithNoV4RouteReverts() public {
        curve.setGraduated(true); // curve done, no v4 pool registered -> no route
        vm.startPrank(game);
        usdg.approve(address(adapter), 100 * U);
        vm.expectRevert(PonsSwapAdapter.NoRoute.selector);
        adapter.swapExactIn(address(usdg), address(drip), 100 * U, 0);
        vm.stopPrank();
    }

    function test_revertsUnregisteredToken() public {
        vm.startPrank(game);
        usdg.approve(address(adapter), 100 * U);
        vm.expectRevert(PonsSwapAdapter.NoRoute.selector);
        adapter.swapExactIn(address(usdg), address(0xBEEF), 100 * U, 0);
        vm.stopPrank();
    }

    function test_revertsQuoteMismatch() public {
        MockERC20 weth = new MockERC20("WETH", "WETH", 18);
        weth.mint(game, 10 ether);
        vm.startPrank(game);
        weth.approve(address(adapter), 1 ether);
        vm.expectRevert(PonsSwapAdapter.QuoteMismatch.selector);
        adapter.swapExactIn(address(weth), address(drip), 1 ether, 0); // curve quote is USDG, not WETH
        vm.stopPrank();
    }

    function test_setCurveValidatesToken() public {
        MockPonsCurve wrong = new MockPonsCurve(address(0xDEAD), address(usdg), RATE);
        vm.prank(owner);
        vm.expectRevert(PonsSwapAdapter.CurveTokenMismatch.selector);
        adapter.setCurve(address(drip), address(wrong)); // curve issues 0xDEAD, not drip
    }
}
