// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.26;

/// @title IFeeDistributor
/// @notice Splits fee revenue that the **launchpad** has already collected on DRIP trades.
///         Drip does NOT levy the fee itself — the launchpad's trading venue takes the 4% and makes
///         our share available (pushed to a wallet we control, or pullable from the launchpad's fee
///         wallet). This contract/keeper only *distributes* what has arrived (SPEC §2.1):
///           - 2% auto-buy -> buffer, swapped into Stock Token(s) by the keeper
///           - 1% marketing -> marketing/ops treasury
///           - 1% launchpad -> retained by the launchpad (handled by the launchpad, not here,
///                             unless we receive the full 4% and must forward it — see feeMode).
/// @dev    The on-chain split is optional: it can also be done off-chain in the keeper. This
///         interface exists for the transparent, on-chain-splitter variant.
interface IFeeDistributor {
    /// @notice How our share reaches us. Confirm with the launchpad (DECISIONS.md #5).
    enum FeeMode {
        ReceiveNet, // launchpad keeps its 1%; we receive the remaining 3% and split 2%/1%
        ReceiveGross // we receive the full 4% and forward 1% to the launchpad ourselves
    }

    /// @param token     Token the fee is denominated in.
    /// @param processed Total fee amount distributed in this call.
    /// @param autoBuy   Amount added to the auto-buy buffer (for the Stock Token swap).
    /// @param marketing Amount sent to the marketing/ops treasury.
    /// @param launchpad Amount forwarded to the launchpad (0 under ReceiveNet).
    event FeeDistributed(
        address indexed token,
        uint256 processed,
        uint256 autoBuy,
        uint256 marketing,
        uint256 launchpad
    );

    /// @notice Distribute fees currently held by this contract (fees that the launchpad routed here
    ///         or that the keeper pulled from the launchpad fee wallet and deposited). Permissionless
    ///         and idempotent: safe for the keeper — or anyone — to call.
    /// @param token The token whose accrued balance should be distributed.
    /// @return autoBuy The amount routed to the auto-buy buffer this call.
    function distribute(address token) external returns (uint256 autoBuy);

    /// @notice Auto-buy buffer awaiting the keeper's swap into Stock Token(s).
    function bufferOf(address token) external view returns (uint256);

    /// @notice The configured fee-delivery mode.
    function feeMode() external view returns (FeeMode);
}
