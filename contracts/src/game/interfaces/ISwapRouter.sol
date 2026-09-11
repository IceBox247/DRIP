// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title ISwapRouter (minimal)
/// @notice Minimal swap abstraction for Buyback. On Robinhood Chain the real implementation routes
///         through Uniswap v4 (call the PoolManager directly — the Universal Router is modified and
///         standard SDK calldata can revert; see docs/ROBINHOOD-CHAIN.md). Kept as an interface so
///         Buyback is testable against a mock and swappable for the real router.
interface ISwapRouter {
    /// @notice Swap exactly `amountIn` of `tokenIn` for `tokenOut`, requiring at least `minOut`.
    /// @dev Caller must approve `amountIn` of `tokenIn` to the router first.
    function swapExactIn(address tokenIn, address tokenOut, uint256 amountIn, uint256 minOut)
        external
        returns (uint256 amountOut);
}

/// @notice Minimal burn hook (DripMineToken is ERC20Burnable).
interface IBurnable {
    function burn(uint256 amount) external;
}
