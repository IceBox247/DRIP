// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.26;

/// @title EmissionsReserve
/// @notice Pre-funded, locked DRIP that GridMine pays round emissions from — so emissions are
///         FIXED-SUPPLY (no mint backdoor), preserving the fair launch. Seeded once at launch with
///         the DRIP allocated to game rewards; only GridMine may pull, capped per round. See
///         docs/GRID-MINE.md ("Emissions — reserve, not mint").
///
/// @dev Skeleton only. Not audited, not for mainnet.
///
/// TODO(Phase 3):
///   - immutable drip token + gridMine address; onlyGridMine guard on release().
///   - Track remaining balance; expose emissionPerRound; stop when depleted (game continues on the
///     redistribution pot alone, or a governance decision tops it up from treasury).
///   - No owner withdraw of the locked allocation (credibility) beyond an explicit, documented path.
contract EmissionsReserve {
    // address public immutable drip;
    // address public immutable gridMine;
    // uint256 public immutable emissionPerRound; // ~1 DRIP (see config gridMine.emissionPerRound)

    /// @notice Release up to `amount` DRIP to `to` (the RefiningVault). Only GridMine. TODO.
    function release(address to, uint256 amount) external {
        to;
        amount;
        revert("EmissionsReserve: not implemented");
    }

    /// @notice Remaining locked emissions balance.
    function remaining() external view returns (uint256) {
        return 0;
    }
}
