// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.26;

import {IRandomnessSource, IRandomnessConsumer} from "../interfaces/IRandomnessSource.sol";

/// @notice Test-only randomness source: fulfills synchronously with a preset word so tests are
///         deterministic. A real source (VRF / commit–reveal) must make the word unpredictable.
contract MockRandomness is IRandomnessSource {
    IRandomnessConsumer public consumer;
    uint256 public word;

    function setConsumer(address c) external {
        consumer = IRandomnessConsumer(c);
    }

    function setWord(uint256 w) external {
        word = w;
    }

    function requestRandomness(uint256 round) external override {
        // Synchronous callback for tests. Real sources call back in a later tx.
        consumer.fulfillRandomness(round, word);
    }
}
