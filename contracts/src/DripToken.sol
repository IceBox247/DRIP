// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.26;

// import {ERC20} from "openzeppelin-contracts/token/ERC20/ERC20.sol";

/// @title DripToken ($DRIP)
/// @notice Fair-launch ERC-20 for Drip. No team allocation. A **plain** ERC-20 with NO fee logic.
/// @dev    IMPORTANT: The 4% trade fee is collected by the **launchpad's trading venue**, NOT by
///         this token and NOT by any Drip contract. There is no tax-on-transfer and no Uniswap
///         hook on our side — the launchpad takes the fee and routes our share to a wallet we
///         control (or one we can pull from). See SPEC §2.1, docs/ARCHITECTURE.md.
///
/// NOTE: The launchpad may deploy the token itself as part of the fair launch. If so, this file is
///       a reference for the expected shape rather than the deployed artifact — confirm who deploys
///       (DECISIONS.md #6).
///
/// TODO(Phase 1, only if WE deploy the token):
///   - Extend OpenZeppelin ERC20 once `forge install OpenZeppelin/openzeppelin-contracts` is run.
///   - Fair-launch mint: mint TOTAL_SUPPLY (config/constants.json — currently TBD) to the launch
///     liquidity destination; NO team/founder allocation (SPEC §1).
///   - Confirm no owner mint/blacklist/pause backdoors (fair-launch credibility).
contract DripToken /* is ERC20 */ {
    string public constant NAME = "Drip";
    string public constant SYMBOL = "DRIP";

    // TODO: constructor(uint256 totalSupply, address launchLiquidityRecipient) ERC20(NAME, SYMBOL) {
    //     _mint(launchLiquidityRecipient, totalSupply); // fair launch, no team cut
    // }
}
