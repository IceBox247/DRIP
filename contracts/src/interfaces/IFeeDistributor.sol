// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title IFeeDistributor
/// @notice Splits the **creator fees that Pons pays us in USDG** on DRIP trades. Drip does NOT levy
///         the fee — Pons's venue takes the trade fee, keeps its protocol cut, and routes our
///         creator share (USDG) to a payout wallet we designate (Pons automation, "push"). This
///         contract/keeper only splits what arrives, keeping the spec's 2:1 intent (SPEC §2.1):
///           - ~2/3 -> auto-buy buffer (USDG), swapped into Stock Token(s) by the keeper
///           - ~1/3 -> marketing/ops treasury
///         Pons already took its protocol cut, so nothing is forwarded back to the launchpad.
/// @dev    USDG is an ERC-20 stablecoin (Global Dollar) on Robinhood Chain — NOT native gas. So the
///         distributor moves an ERC-20 balance (no payable receive); Pons automation transfers USDG
///         to this contract/wallet. The on-chain split is OPTIONAL — the keeper can move the USDG
///         directly instead; this interface is the transparent, verifiable variant. Shares come from
///         config/constants.json internalSplit.*.
interface IFeeDistributor {
    /// @param processed Total USDG distributed in this call.
    /// @param autoBuy   Amount routed to the auto-buy buffer (for the Stock Token swap).
    /// @param marketing Amount sent to the marketing/ops treasury.
    event FeeDistributed(uint256 processed, uint256 autoBuy, uint256 marketing);

    /// @notice The USDG token this distributor splits.
    function usdg() external view returns (address);

    /// @notice Distribute the USDG creator fees currently held (transferred here by Pons automation,
    ///         or deposited by the keeper). Permissionless and idempotent — safe for the keeper, or
    ///         anyone, to call.
    /// @return autoBuy The amount routed to the auto-buy buffer this call.
    function distribute() external returns (uint256 autoBuy);

    /// @notice Auto-buy buffer (USDG) awaiting the keeper's swap into Stock Token(s).
    function buffer() external view returns (uint256);
}
