// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ISwapRouter, IBurnable} from "./interfaces/ISwapRouter.sol";

/// @title Buyback
/// @notice Takes the GridMine protocol cut (USDG) and buys DRIP, then burns most and sends the rest
///         to the staking vault. Without this the game is just a casino — the buyback is the token
///         sink. See docs/GRID-MINE.md.
/// @dev Permissionless + idempotent: anyone/keeper may call `execute`. Swap MUST be slippage-bounded
///      via `minDripOut`. On Robinhood Chain, wire `router` to a v4 adapter that calls PoolManager
///      directly (docs/ROBINHOOD-CHAIN.md).
contract Buyback is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint16 public constant BURN_BPS = 9000; // 90% burned
    uint16 public constant BPS = 10_000;

    IERC20 public immutable usdg;
    IERC20 public immutable drip;
    ISwapRouter public immutable router;
    address public immutable stakers; // receives the non-burned remainder (StakeVault)

    event BoughtBack(uint256 usdgIn, uint256 dripOut, uint256 burned, uint256 toStakers);

    constructor(IERC20 usdg_, IERC20 drip_, ISwapRouter router_, address stakers_) {
        usdg = usdg_;
        drip = drip_;
        router = router_;
        stakers = stakers_;
    }

    /// @notice Swap all held USDG → DRIP (>= minDripOut), burn BURN_BPS, send the rest to stakers.
    function execute(uint256 minDripOut) external nonReentrant returns (uint256 dripOut) {
        uint256 bal = usdg.balanceOf(address(this));
        if (bal == 0) return 0;

        usdg.forceApprove(address(router), bal);
        dripOut = router.swapExactIn(address(usdg), address(drip), bal, minDripOut);

        uint256 burnAmt = (dripOut * BURN_BPS) / BPS;
        uint256 toStakers = dripOut - burnAmt;
        if (burnAmt > 0) IBurnable(address(drip)).burn(burnAmt);
        if (toStakers > 0) drip.safeTransfer(stakers, toStakers);
        emit BoughtBack(bal, dripOut, burnAmt, toStakers);
    }
}
