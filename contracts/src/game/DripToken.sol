// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";

/// @title DripToken ($DRIP)
/// @notice Fixed-supply, fair-launch ERC-20. **No minting, ever** — the entire supply is created at
///         deploy and sent to the launch recipient (the Pons launch, which seeds the DRIP/USDG
///         liquidity). The game never mints: round rewards are DRIP the protocol *buys* from that
///         pool with USDG (docs/GRID-MINE.md). Burnable so the buyback can burn the bought DRIP.
/// @dev No owner, no mint, no blacklist/pause — nothing to rug. What you deploy is the whole supply.
contract DripToken is ERC20, ERC20Burnable {
    constructor(uint256 totalSupply_, address launchRecipient) ERC20("Drip", "DRIP") {
        _mint(launchRecipient, totalSupply_); // one-time; there is no mint() function
    }
}
