// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title IRewardVault
/// @notice Holds Stock Tokens and pays out per-cycle allocations via Merkle proofs. The backend
///         computes each user's allocation off-chain and publishes only the root. SPEC §2.4.
interface IRewardVault {
    event RootPublished(uint256 indexed cycle, bytes32 root, uint256 totalAllocated);
    event Claimed(uint256 indexed cycle, address indexed account, uint256 amount);

    /// @notice Publish the Merkle root for a cycle's allocations. Restricted to the publisher role.
    /// @dev    Consider a challenge window before claims open — see ARCHITECTURE.md trust note.
    /// @param cycle          The distribution cycle this root covers.
    /// @param root           Merkle root over (account, amount) leaves for this cycle.
    /// @param totalAllocated Sum of all allocations under this root (must be funded in the vault).
    function publishRoot(uint256 cycle, bytes32 root, uint256 totalAllocated) external;

    /// @notice Claim a cycle allocation with a Merkle proof.
    /// @param cycle   The cycle being claimed.
    /// @param account The beneficiary (leaf = keccak256(abi.encode(account, amount))).
    /// @param amount  The allocated Stock Token amount.
    /// @param proof   Merkle proof for the leaf against the cycle's published root.
    function claim(uint256 cycle, address account, uint256 amount, bytes32[] calldata proof)
        external;

    /// @notice Whether `account` has already claimed for `cycle`.
    function isClaimed(uint256 cycle, address account) external view returns (bool);
}
