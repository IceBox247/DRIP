// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.26;

import {IRewardVault} from "./interfaces/IRewardVault.sol";

/// @title RewardVault
/// @notice Holds Stock Tokens and pays out per-cycle allocations via Merkle proofs (SPEC §2.4).
///         The backend computes each user's allocation off-chain (from points earned that cycle)
///         and publishes only the Merkle root here; users claim with a proof.
/// @dev    ⚠️ GATED BY BLOCKERS #1: this whole contract assumes the Stock Token is freely
///         transferable to arbitrary wallets. VERIFY that on-chain before implementing — see
///         docs/BLOCKERS.md. If the token is whitelist-gated, this design does not work as-is.
///
/// TODO(Phase 3):
///   - Store per-cycle roots + totalAllocated; enforce the vault is funded before a root opens.
///   - claim(): verify proof over leaf keccak256(abi.encode(account, amount)); mark claimed;
///     SafeERC20 transfer of the Stock Token; enforce optional claim cooldown (constants.claim).
///   - publishRoot(): restrict to a publisher role; consider a challenge window before claims open
///     (ARCHITECTURE.md trust note); make points inputs reproducible/auditable.
contract RewardVault is IRewardVault {
    // address public immutable stockToken;
    // mapping(uint256 cycle => bytes32) public rootOf;
    // mapping(uint256 cycle => mapping(address => bool)) internal _claimed;

    /// @inheritdoc IRewardVault
    function publishRoot(uint256 cycle, bytes32 root, uint256 totalAllocated) external override {
        cycle;
        root;
        totalAllocated;
        revert("RewardVault: not implemented");
    }

    /// @inheritdoc IRewardVault
    function claim(uint256 cycle, address account, uint256 amount, bytes32[] calldata proof)
        external
        override
    {
        cycle;
        account;
        amount;
        proof;
        revert("RewardVault: not implemented");
    }

    /// @inheritdoc IRewardVault
    function isClaimed(uint256 cycle, address account) external view override returns (bool) {
        cycle;
        account;
        return false;
    }
}
