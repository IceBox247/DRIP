// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.26;

/// @title Minimal Uniswap v4 surface
/// @notice Just the PoolManager entrypoints a single-hop exact-in swap needs, hand-declared so we
///         don't pull the whole v4-core dependency tree. Robinhood Chain's Universal Router is
///         modified (SDK calldata can revert), so we call the PoolManager directly via unlock →
///         unlockCallback (docs/ROBINHOOD-CHAIN.md). Verified against the live NVDA/USDG pool.
/// @dev BalanceDelta packs amount0 in the high int128 and amount1 in the low int128. A negative
///      amount is owed BY the swapper to the pool (must settle); a positive amount is owed TO the
///      swapper (must take).

/// @dev A v4 pool identity. `currency0 < currency1` (address order). `hooks`/`fee` come from the
///      pool's Initialize event, never guessed.
struct PoolKey {
    address currency0;
    address currency1;
    uint24 fee;
    int24 tickSpacing;
    address hooks;
}

struct SwapParams {
    bool zeroForOne; // true = swap currency0 -> currency1
    int256 amountSpecified; // negative = exact input
    uint160 sqrtPriceLimitX96;
}

interface IPoolManager {
    /// @notice Unlock the manager and call back `unlockCallback(data)` on msg.sender.
    function unlock(bytes calldata data) external returns (bytes memory);

    /// @notice Swap within a pool. Returns the BalanceDelta (packed int128 pair).
    function swap(PoolKey calldata key, SwapParams calldata params, bytes calldata hookData)
        external
        returns (int256 delta);

    /// @notice Pull a settlement: record the manager's current balance of `currency`.
    function sync(address currency) external;

    /// @notice Settle owed currency: after `sync` + transferring the token in, credits the payer.
    function settle() external payable returns (uint256 paid);

    /// @notice Take `amount` of `currency` out to `to`.
    function take(address currency, address to, uint256 amount) external;
}

/// @notice The manager calls this back inside `unlock`.
interface IUnlockCallback {
    function unlockCallback(bytes calldata data) external returns (bytes memory);
}
