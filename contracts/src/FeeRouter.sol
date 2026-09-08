// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.26;

import {IFeeRouter} from "./interfaces/IFeeRouter.sol";

/// @title FeeRouter
/// @notice Splits the 4% trade fee into three slices (SPEC §2.1):
///           - 1% launchpad   -> launchpad wallet (fixed by launchpad)
///           - 2% auto-buy    -> buffer, swapped hourly by the keeper into Stock Token(s)
///           - 1% marketing   -> marketing/ops treasury (also funds servers/audit/legal — §7)
/// @dev    Basis points are configured from config/constants.json. The three slices must sum to
///         the total fee (400 bps). See DECISIONS.md #1 re: whether marketing doubles as ops.
///
/// TODO(Phase 1):
///   - Add access control (only the hook may call routeFee) and immutable destination addresses.
///   - Use SafeERC20 for transfers; hold the auto-buy slice as `bufferOf(token)` until the keeper
///     pulls it for the swap.
///   - Emit FeeRouted with the exact per-slice amounts (handle rounding dust deterministically).
contract FeeRouter is IFeeRouter {
    // Basis points — mirror config/constants.json (fee.launchpadBps / autoBuyBps / marketingBps).
    uint16 public constant LAUNCHPAD_BPS = 100; // 1%
    uint16 public constant AUTO_BUY_BPS = 200; // 2%
    uint16 public constant MARKETING_BPS = 100; // 1%
    uint16 public constant TOTAL_BPS = 400; // 4%

    // address public immutable launchpadWallet;
    // address public immutable marketingTreasury;
    // mapping(address token => uint256) internal _buffer;

    /// @inheritdoc IFeeRouter
    function routeFee(address token, uint256 amount) external override {
        // TODO(Phase 1): split `amount` by the bps above; forward launchpad + marketing slices;
        //                retain the auto-buy slice in the buffer; emit FeeRouted.
        token;
        amount;
        revert("FeeRouter: not implemented");
    }

    /// @inheritdoc IFeeRouter
    function bufferOf(address token) external view override returns (uint256) {
        // return _buffer[token];
        token;
        return 0;
    }
}
