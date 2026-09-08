// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.26;

import {IFeeDistributor} from "./interfaces/IFeeDistributor.sol";

/// @title FeeDistributor
/// @notice Distributes fee revenue that the **launchpad already collected** on DRIP trades. Drip
///         levies no fee of its own (no Uniswap hook, no tax-on-transfer). The launchpad's venue
///         takes the 4% and makes our share available; this contract only splits what arrives:
///           - 2% -> auto-buy buffer (keeper swaps to Stock Token(s))
///           - 1% -> marketing/ops treasury
///           - 1% -> launchpad (retained by them under ReceiveNet; forwarded by us under ReceiveGross)
/// @dev    Splitting on-chain is OPTIONAL — the keeper can do the same split off-chain by moving
///         tokens directly. This contract is the transparent, verifiable variant. See
///         contracts/README.md and docs/ARCHITECTURE.md.
///
/// TODO(Phase 1):
///   - Set feeMode + immutable destinations (marketingTreasury, launchpadWallet, reserveManager).
///   - distribute(): compute slices from the balance held; use SafeERC20; retain the auto-buy slice
///     in the buffer for the keeper; emit FeeDistributed. Keep it permissionless + idempotent.
///   - Handle rounding dust deterministically.
contract FeeDistributor is IFeeDistributor {
    // Basis points — mirror config/constants.json (fee.*). Slices are of the total 4% fee.
    uint16 public constant AUTO_BUY_BPS = 200; // 2%
    uint16 public constant MARKETING_BPS = 100; // 1%
    uint16 public constant LAUNCHPAD_BPS = 100; // 1% (retained by launchpad, or forwarded by us)
    uint16 public constant TOTAL_BPS = 400; // 4%

    // FeeMode public immutable override feeMode;
    // address public immutable marketingTreasury;
    // address public immutable launchpadWallet; // only used under ReceiveGross
    // mapping(address token => uint256) internal _buffer;

    /// @inheritdoc IFeeDistributor
    function distribute(address token) external override returns (uint256 autoBuy) {
        // TODO(Phase 1): split the held balance of `token`; forward marketing (+launchpad if gross);
        //                retain the auto-buy slice in the buffer; emit FeeDistributed.
        token;
        revert("FeeDistributor: not implemented");
    }

    /// @inheritdoc IFeeDistributor
    function bufferOf(address token) external view override returns (uint256) {
        token;
        return 0;
    }

    /// @inheritdoc IFeeDistributor
    function feeMode() external pure override returns (FeeMode) {
        // Default assumption: launchpad keeps its 1% and routes us the rest. Confirm — DECISIONS.md #5.
        return FeeMode.ReceiveNet;
    }
}
