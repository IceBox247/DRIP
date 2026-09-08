// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.26;

/// @title IFeeRouter
/// @notice Receives the 4% trade fee (as DRIP or the swap's currency) and splits it into the three
///         slices defined in SPEC §2.1: 1% launchpad / 2% auto-buy buffer / 1% marketing-ops.
interface IFeeRouter {
    /// @notice Emitted whenever a fee is routed to its three destinations.
    /// @param token     The token the fee was collected in.
    /// @param total     Total fee amount routed.
    /// @param launchpad Amount sent to the launchpad wallet.
    /// @param autoBuy   Amount added to the auto-buy buffer.
    /// @param marketing Amount sent to the marketing/ops treasury.
    event FeeRouted(
        address indexed token,
        uint256 total,
        uint256 launchpad,
        uint256 autoBuy,
        uint256 marketing
    );

    /// @notice Route a collected fee. Caller (the hook) must have transferred `amount` of `token`
    ///         to this contract, or approved it for pull. Splits per the configured basis points.
    /// @param token  The token the fee is denominated in.
    /// @param amount The fee amount to split.
    function routeFee(address token, uint256 amount) external;

    /// @notice Current auto-buy buffer balance for a given token, awaiting the keeper's swap.
    function bufferOf(address token) external view returns (uint256);
}
