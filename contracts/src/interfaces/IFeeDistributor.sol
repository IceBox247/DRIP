// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.26;

/// @title IFeeDistributor
/// @notice Splits the **creator fees that Pons pays us in ETH** on DRIP trades. Drip does NOT levy
///         the fee — Pons's venue takes the trade fee, keeps its protocol cut, and routes our
///         creator share (ETH) to a payout wallet we designate (Pons automation, "push"). This
///         contract/keeper only splits what arrives, keeping the spec's 2:1 intent (SPEC §2.1):
///           - ~2/3 -> auto-buy buffer (ETH), swapped into Stock Token(s) by the keeper
///           - ~1/3 -> marketing/ops treasury
///         Pons already took its protocol cut, so nothing is forwarded back to the launchpad.
/// @dev    Fees are native ETH. Where an address is needed to denote the asset, use address(0) for
///         native ETH (or the WETH address if the split is done in WETH). The on-chain split is
///         OPTIONAL — the keeper can move ETH directly instead; this interface is the transparent,
///         verifiable variant. Shares come from config/constants.json internalSplit.*.
interface IFeeDistributor {
    /// @param processed Total ETH distributed in this call.
    /// @param autoBuy   Amount routed to the auto-buy buffer (for the Stock Token swap).
    /// @param marketing Amount sent to the marketing/ops treasury.
    event FeeDistributed(uint256 processed, uint256 autoBuy, uint256 marketing);

    /// @notice Distribute the ETH creator fees currently held (routed here by Pons automation, or
    ///         deposited by the keeper). Permissionless and idempotent — safe for the keeper, or
    ///         anyone, to call.
    /// @return autoBuy The amount routed to the auto-buy buffer this call.
    function distribute() external returns (uint256 autoBuy);

    /// @notice Auto-buy buffer (ETH) awaiting the keeper's swap into Stock Token(s).
    function buffer() external view returns (uint256);
}
