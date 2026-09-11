// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.26;

/// @title IPonsBondingCurve (minimal)
/// @notice The subset of a Pons V2 bonding curve the reward engine needs to buy a launch token with
///         its quote asset before the token graduates to a Uniswap v4 pool. Verified against the live
///         FLYCOINHUNT curve on Robinhood Chain (0xa077…df86): USDG-quoted, `buy` takes the quote in
///         and sends the launch token to `recipient`, `minTokensOut` bounds slippage.
/// @dev For an ERC-20 quote (e.g. USDG) the caller must approve `quoteIn` to the curve, then call
///      `buy` with no msg.value. `buy` may fill only partially near graduation and refund the unused
///      quote to the caller. Once `graduated()` is true, buys revert — route through the v4 pool.
interface IPonsBondingCurve {
    function buy(uint256 quoteIn, uint256 minTokensOut, address recipient)
        external
        payable
        returns (uint256 tokensOut);

    function token() external view returns (address);
    function pairToken() external view returns (address);
    function graduated() external view returns (bool);
    function isNativeQuote() external view returns (bool);
}
