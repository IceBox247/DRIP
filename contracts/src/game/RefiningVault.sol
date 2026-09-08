// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.26;

/// @title RefiningVault
/// @notice Holds winners' accrued DRIP. Claiming costs REFINE_FEE_BPS (ORE ~10%), and that fee is
///         redistributed to holders who have NOT yet claimed — fast sellers subsidize diamond hands.
///         See docs/GRID-MINE.md ("Anti-dump: refining").
///
/// @dev Skeleton only. Not audited, not for mainnet. The fair redistribution of the claim fee to
///      remaining unclaimed balances is the tricky part — implement with an accumulator
///      (reward-per-share) pattern to stay O(1) per claim, not a loop over holders.
///
/// TODO(Phase 3):
///   - credit(account, amount): GridMine credits winners' DRIP here (from EmissionsReserve + pot).
///   - claim(): transfer balance minus REFINE_FEE_BPS; distribute the fee to unclaimed balances via
///     an accumulator; checks-effects-interactions + SafeERC20.
contract RefiningVault {
    uint16 public constant REFINE_FEE_BPS = 1000; // 10% claim tax → unclaimed holders
    uint16 public constant BPS_DENOMINATOR = 10_000;

    // address public immutable drip;
    // address public immutable gridMine; // only GridMine may credit

    event Credited(address indexed account, uint256 amount);
    event Claimed(address indexed account, uint256 net, uint256 fee);

    /// @notice Credit `amount` DRIP to `account` (winner emission/pot). Only GridMine. TODO.
    function credit(address account, uint256 amount) external {
        account;
        amount;
        revert("RefiningVault: not implemented");
    }

    /// @notice Claim your accrued DRIP, paying the refining fee to unclaimed holders. TODO.
    function claim() external {
        revert("RefiningVault: not implemented");
    }

    /// @notice Claimable (gross) balance for `account`, before the refining fee.
    function balanceOf(address account) external view returns (uint256) {
        account;
        return 0;
    }
}
