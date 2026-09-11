// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IPonsBondingCurve} from "../interfaces/IPonsBondingCurve.sol";

/// @notice Test-only stand-in for a Pons V2 bonding curve: pulls the ERC-20 quote and pays the launch
///         token from its own pre-funded balance at a fixed rate. Mirrors the real curve's `buy`
///         surface (ERC-20 quote, minOut slippage, partial-fill refund) so PonsSwapAdapter is tested
///         against the same behavior without a live pool.
contract MockPonsCurve is IPonsBondingCurve {
    using SafeERC20 for IERC20;

    address public immutable override token;
    address public immutable override pairToken;
    bool public override graduated;
    uint256 public rate; // out = quoteIn * rate / 1e6 (1e18 bridges 6dp quote -> 18dp token at ~1:1)
    uint256 public fillBps = 10_000; // <10_000 simulates a partial fill (refund the remainder)

    constructor(address token_, address pairToken_, uint256 rate_) {
        token = token_;
        pairToken = pairToken_;
        rate = rate_;
    }

    function isNativeQuote() external pure override returns (bool) {
        return false;
    }

    function setGraduated(bool g) external {
        graduated = g;
    }

    function setFillBps(uint256 bps) external {
        fillBps = bps;
    }

    function buy(uint256 quoteIn, uint256 minTokensOut, address recipient)
        external
        payable
        override
        returns (uint256 tokensOut)
    {
        require(!graduated, "graduated");
        uint256 spent = (quoteIn * fillBps) / 10_000;
        IERC20(pairToken).safeTransferFrom(msg.sender, address(this), spent); // only take what we fill
        tokensOut = (spent * rate) / 1e6;
        // price-bound check like the real curve (reduces to tokensOut >= minTokensOut on a full fill)
        require(spent * minTokensOut <= quoteIn * tokensOut, "slippage");
        IERC20(token).safeTransfer(recipient, tokensOut);
    }
}
