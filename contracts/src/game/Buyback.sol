// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.26;

/// @title Buyback
/// @notice Takes the GridMine protocol cut (in the deploy asset, e.g. USDG) and buys DRIP in the
///         `DRIP/<deploy asset>` Uniswap v4 pool, then BURNS most of it and sends the rest to
///         stakers. If buybacks outrun emissions, effective float shrinks. Without this, the game
///         is just a casino — the buyback is what makes it a token engine. See docs/GRID-MINE.md.
///
/// @dev Skeleton only. Not audited, not for mainnet. Robinhood's Universal Router is modified and
///      standard Uniswap SDK calldata can revert — several teams call the v4 PoolManager directly
///      (see docs/ROBINHOOD-CHAIN.md). Swaps MUST be slippage-bounded (oracle or quoter check).
///
/// TODO(Phase 3):
///   - immutable drip, deployAsset, poolManager, stakingSink; BURN_BPS split.
///   - execute(): swap held deployAsset → DRIP (slippage-bounded); burn BURN_BPS; send remainder to
///     stakers. Permissionless + idempotent so a keeper (or anyone) can poke it.
contract Buyback {
    uint16 public constant BURN_BPS = 9000; // 90% burn
    uint16 public constant STAKERS_BPS = 1000; // 10% to stakers
    uint16 public constant BPS_DENOMINATOR = 10_000;

    event BoughtBack(uint256 assetIn, uint256 dripOut, uint256 burned, uint256 toStakers);

    /// @notice Swap the held protocol-cut asset into DRIP, burn most, send the rest to stakers. TODO.
    function execute(uint256 minDripOut) external {
        minDripOut;
        revert("Buyback: not implemented");
    }
}
