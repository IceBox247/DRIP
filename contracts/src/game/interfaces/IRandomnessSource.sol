// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title IRandomnessSource
/// @notice Abstraction over the randomness backend so GridMine doesn't care whether it's VRF,
///         RH-VRF, or a bonded commit–reveal. GridMine calls `requestRandomness(round)`; the source
///         later calls back `GridMine.fulfillRandomness(round, word)` with an unpredictable word.
/// @dev The consumer (GridMine) MUST restrict `fulfillRandomness` to the configured source, and the
///      source MUST NOT let anyone (owner included) choose the word. See docs/GRID-MINE.md.
interface IRandomnessSource {
    function requestRandomness(uint256 round) external;
}

/// @notice Callback the randomness source invokes on the consumer.
interface IRandomnessConsumer {
    function fulfillRandomness(uint256 round, uint256 word) external;
}
