// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IFeeDistributor} from "./interfaces/IFeeDistributor.sol";
// import {IERC20} from "openzeppelin-contracts/token/ERC20/IERC20.sol";
// import {SafeERC20} from "openzeppelin-contracts/token/ERC20/utils/SafeERC20.sol";

/// @title FeeDistributor
/// @notice Splits the **creator fees Pons pays us in USDG** on DRIP trades. Drip levies no fee of its
///         own (no Uniswap hook, no tax-on-transfer). Pons's venue takes the trade fee, keeps its
///         protocol cut, and routes our creator share (USDG) to our payout wallet via automation.
///         This contract splits that USDG, keeping the spec's 2:1 intent:
///           - ~2/3 -> auto-buy buffer (USDG), swapped to Stock Token(s) by the keeper
///           - ~1/3 -> marketing/ops treasury
///         Nothing is forwarded to Pons — it already took its cut before we received anything.
/// @dev    USDG is an ERC-20 stablecoin (Global Dollar) on Robinhood Chain, NOT native gas — so this
///         contract moves an ERC-20 balance and has no payable receive(). Splitting on-chain is
///         OPTIONAL — the keeper can move the USDG directly. This is the transparent, verifiable
///         variant. Shares mirror config/constants.json internalSplit.* and must sum to 10_000.
///         See contracts/README.md and docs/ARCHITECTURE.md.
///
/// TODO(Phase 1):
///   - Set immutable USDG address + destinations (marketingTreasury, reserveManager/auto-buy sink).
///   - distribute(): read IERC20(usdg).balanceOf(this) not yet buffered; split by the bps below;
///     SafeERC20-transfer the marketing slice; retain the auto-buy slice as `buffer` for the keeper;
///     emit FeeDistributed. Keep it permissionless + idempotent.
///   - Handle rounding dust deterministically (assign remainder to one slice).
contract FeeDistributor is IFeeDistributor {
    // Basis points of RECEIVED creator fees (config/constants.json internalSplit.*). Must sum to 10_000.
    uint16 public constant AUTO_BUY_SHARE_BPS = 6667; // ~2/3 -> Stock Token auto-buy
    uint16 public constant MARKETING_SHARE_BPS = 3333; // ~1/3 -> marketing/ops
    uint16 public constant BPS_DENOMINATOR = 10_000;

    // address public immutable override usdg;
    // address public immutable marketingTreasury;
    // address public immutable autoBuySink; // ReserveManager or a buffer the keeper swaps from
    // uint256 internal _buffer;

    // constructor(address _usdg, address _marketingTreasury, address _autoBuySink) {
    //     usdg = _usdg; marketingTreasury = _marketingTreasury; autoBuySink = _autoBuySink;
    // }

    /// @inheritdoc IFeeDistributor
    function usdg() external pure override returns (address) {
        // return the immutable USDG address once wired.
        return address(0);
    }

    /// @inheritdoc IFeeDistributor
    function distribute() external override returns (uint256 autoBuy) {
        // TODO(Phase 1): split the held USDG balance by the bps above; SafeERC20-transfer the
        //                marketing slice to the treasury; retain the auto-buy slice in `buffer`;
        //                emit FeeDistributed.
        revert("FeeDistributor: not implemented");
    }

    /// @inheritdoc IFeeDistributor
    function buffer() external view override returns (uint256) {
        // return _buffer;
        return 0;
    }
}
