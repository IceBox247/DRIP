// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {PonsSwapAdapter} from "../../src/game/PonsSwapAdapter.sol";
import {PoolKey} from "../../src/game/interfaces/IUniswapV4.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice Forks Robinhood Chain mainnet and buys real NVDA with real USDG through the live v4 pool,
///         via PonsSwapAdapter's direct-PoolManager path. Proves the v4 leg works against the actual
///         pool + hook before it's used with real funds. Runs only when RHC_MAINNET_RPC_URL is set:
///           RHC_MAINNET_RPC_URL=https://rpc.mainnet.chain.robinhood.com \
///           forge test --match-path test/game/V4NvdaFork.t.sol -vv
contract V4NvdaForkTest is Test {
    address constant POOL_MANAGER = 0x8366a39CC670B4001A1121B8F6A443A643e40951;
    address constant USDG = 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168;
    address constant NVDA = 0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC;
    address constant NVDA_HOOK = 0xb3502dc2Fc6BaDf3f184A87Cb3e31f95FfF16181;

    PonsSwapAdapter adapter;
    address game = makeAddr("game");

    function setUp() public {
        string memory rpc = vm.envOr("RHC_MAINNET_RPC_URL", string(""));
        if (bytes(rpc).length == 0) return;
        vm.createSelectFork(rpc);

        adapter = new PonsSwapAdapter(address(this), POOL_MANAGER);
        // The live NVDA/USDG pool (from its Initialize event): dynamic fee, tickSpacing 60, hook above.
        adapter.setV4Pool(
            NVDA,
            PoolKey({currency0: USDG, currency1: NVDA, fee: 0x800000, tickSpacing: 60, hooks: NVDA_HOOK})
        );
    }

    function test_buyNvdaWithUsdg_live() public {
        string memory rpc = vm.envOr("RHC_MAINNET_RPC_URL", string(""));
        if (bytes(rpc).length == 0) {
            emit log("SKIP: set RHC_MAINNET_RPC_URL to run the live NVDA fork test");
            return;
        }
        uint256 amountIn = 5 * 1e6; // 5 USDG
        deal(USDG, game, amountIn);

        vm.startPrank(game);
        IERC20(USDG).approve(address(adapter), amountIn);
        uint256 out = adapter.swapExactIn(USDG, NVDA, amountIn, 1); // minOut=1 wei, just prove it fills
        vm.stopPrank();

        emit log_named_uint("NVDA out (18dp)", out);
        assertGt(out, 0, "received NVDA");
        assertEq(IERC20(NVDA).balanceOf(game), out, "NVDA landed on the caller");
        assertEq(IERC20(USDG).balanceOf(game), 0, "USDG spent");
    }
}
