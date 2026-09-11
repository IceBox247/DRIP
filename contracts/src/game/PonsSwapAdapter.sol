// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ISwapRouter} from "./interfaces/ISwapRouter.sol";
import {IPonsBondingCurve} from "./interfaces/IPonsBondingCurve.sol";

/// @title PonsSwapAdapter
/// @notice Real swap router for GridMine on Robinhood Chain: turns the round's quote asset (USDG)
///         into the reward token by buying it from that token's **Pons V2 bonding curve** while the
///         token is still pre-graduation. Implements the same `ISwapRouter.swapExactIn` the game
///         already calls, so GridMine is unchanged — the mock router is simply swapped for this.
///
/// @dev The owner registers each reward token → its bonding curve (`setCurve`). On a swap the adapter
///      pulls `amountIn` of `tokenIn` from the caller, approves it to the curve, and calls
///      `curve.buy(amountIn, minOut, caller)` so the bought tokens land directly on the caller
///      (GridMine). `minOut` is passed straight through for slippage protection. Any quote the curve
///      refunds (partial fill near graduation) is returned to the caller.
///
///      ⚠️ Pre-graduation only for now. Once a token graduates to its locked Uniswap v4 pool,
///      `curve.buy` reverts; a v4 leg must be added before then (tracked separately). Buys of an
///      unregistered token revert rather than silently mis-routing funds.
contract PonsSwapAdapter is ISwapRouter, Ownable {
    using SafeERC20 for IERC20;

    /// @notice reward token => its Pons bonding curve.
    mapping(address => IPonsBondingCurve) public curveFor;

    event CurveSet(address indexed token, address curve);
    event Bought(address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut);

    error NoCurve();
    error CurveTokenMismatch();
    error QuoteMismatch();
    error Graduated();

    constructor(address owner_) Ownable(owner_) {}

    /// @notice Register (or clear) the Pons curve used to buy `token`. Owner only. The curve is
    ///         validated to actually issue `token`, so a wrong address can't be wired by mistake.
    function setCurve(address token, address curve) external onlyOwner {
        if (curve != address(0)) {
            if (IPonsBondingCurve(curve).token() != token) revert CurveTokenMismatch();
        }
        curveFor[token] = IPonsBondingCurve(curve);
        emit CurveSet(token, curve);
    }

    /// @inheritdoc ISwapRouter
    function swapExactIn(address tokenIn, address tokenOut, uint256 amountIn, uint256 minOut)
        external
        override
        returns (uint256 amountOut)
    {
        IPonsBondingCurve curve = curveFor[tokenOut];
        if (address(curve) == address(0)) revert NoCurve();
        if (curve.graduated()) revert Graduated(); // TODO: v4 pool leg for post-graduation
        if (curve.pairToken() != tokenIn) revert QuoteMismatch();

        // Pull the quote from the caller (GridMine), then approve it to the curve.
        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);
        IERC20(tokenIn).forceApprove(address(curve), amountIn);

        // Buy the reward token straight to the caller; minOut enforces slippage inside the curve.
        amountOut = curve.buy(amountIn, minOut, msg.sender);

        // Clear any residual approval and refund any quote the curve didn't spend (partial fill).
        IERC20(tokenIn).forceApprove(address(curve), 0);
        uint256 leftover = IERC20(tokenIn).balanceOf(address(this));
        if (leftover != 0) IERC20(tokenIn).safeTransfer(msg.sender, leftover);

        emit Bought(tokenIn, tokenOut, amountIn, amountOut);
    }
}
