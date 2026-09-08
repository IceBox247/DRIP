// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.26;

import {IFeeDistributor} from "./interfaces/IFeeDistributor.sol";

/// @title FeeDistributor
/// @notice Splits the **creator fees Pons pays us in ETH** on DRIP trades. Drip levies no fee of its
///         own (no Uniswap hook, no tax-on-transfer). Pons's venue takes the trade fee, keeps its
///         protocol cut, and routes our creator share (ETH) to our payout wallet via automation.
///         This contract splits that ETH, keeping the spec's 2:1 intent:
///           - ~2/3 -> auto-buy buffer (ETH), swapped to Stock Token(s) by the keeper
///           - ~1/3 -> marketing/ops treasury
///         Nothing is forwarded to Pons — it already took its cut before we received anything.
/// @dev    Splitting on-chain is OPTIONAL — the keeper can move the ETH directly. This is the
///         transparent, verifiable variant. Shares mirror config/constants.json internalSplit.*
///         and must sum to 10_000. See contracts/README.md and docs/ARCHITECTURE.md.
///
/// TODO(Phase 1):
///   - Set immutable destinations (marketingTreasury, reserveManager/auto-buy sink).
///   - Accept ETH (receive() external payable) — Pons automation credits this wallet/contract.
///   - distribute(): split the held ETH balance by the bps below; send marketing slice; retain the
///     auto-buy slice as `buffer` for the keeper; emit FeeDistributed. Permissionless + idempotent.
///   - Handle rounding dust deterministically (assign remainder to one slice).
contract FeeDistributor is IFeeDistributor {
    // Basis points of RECEIVED creator fees (config/constants.json internalSplit.*). Must sum to 10_000.
    uint16 public constant AUTO_BUY_SHARE_BPS = 6667; // ~2/3 -> Stock Token auto-buy
    uint16 public constant MARKETING_SHARE_BPS = 3333; // ~1/3 -> marketing/ops
    uint16 public constant BPS_DENOMINATOR = 10_000;

    // address public immutable marketingTreasury;
    // address public immutable autoBuySink; // ReserveManager or a buffer the keeper swaps from
    // uint256 internal _buffer;

    /// @notice Accept ETH creator fees routed here by Pons automation.
    receive() external payable {}

    /// @inheritdoc IFeeDistributor
    function distribute() external override returns (uint256 autoBuy) {
        // TODO(Phase 1): split address(this).balance by the bps above; send marketing slice to the
        //                treasury; retain the auto-buy slice in `buffer`; emit FeeDistributed.
        revert("FeeDistributor: not implemented");
    }

    /// @inheritdoc IFeeDistributor
    function buffer() external view override returns (uint256) {
        // return _buffer;
        return 0;
    }
}
