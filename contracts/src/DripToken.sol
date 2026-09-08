// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.26;

// import {ERC20} from "openzeppelin-contracts/token/ERC20/ERC20.sol";

/// @title DripToken ($DRIP)
/// @notice Fair-launch ERC-20 for Drip. No team allocation.
/// @dev    IMPORTANT: The 4% trade fee is levied by the Uniswap v4 hook (`DripFeeHook`), NOT here.
///         Tax-on-transfer logic inside `transfer()`/`transferFrom()` breaks DEX routers, so this
///         token stays a plain ERC-20. See SPEC §2.1 and contracts/README.md.
///
/// TODO(Phase 1):
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
