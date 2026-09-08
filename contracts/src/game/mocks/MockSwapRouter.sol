// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ISwapRouter} from "../interfaces/ISwapRouter.sol";

/// @notice Test-only swap router: pulls tokenIn and pays tokenOut from its own pre-funded balance at
///         a fixed `rateBps` (10_000 = 1:1, ignoring decimals). Stands in for a Uniswap v4 adapter.
contract MockSwapRouter is ISwapRouter {
    using SafeERC20 for IERC20;

    uint256 public rateBps = 10_000; // out = in * rateBps / 10_000

    function setRate(uint256 bps) external {
        rateBps = bps;
    }

    function swapExactIn(address tokenIn, address tokenOut, uint256 amountIn, uint256 minOut)
        external
        override
        returns (uint256 amountOut)
    {
        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);
        amountOut = (amountIn * rateBps) / 10_000;
        require(amountOut >= minOut, "slippage");
        IERC20(tokenOut).safeTransfer(msg.sender, amountOut);
    }
}
