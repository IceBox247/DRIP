// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {CommitRevealRandomness} from "../../src/game/CommitRevealRandomness.sol";
import {IRandomnessConsumer} from "../../src/game/interfaces/IRandomnessSource.sol";

/// @dev Minimal consumer that records the word it was handed, standing in for GridMine.
contract MockConsumer is IRandomnessConsumer {
    uint256 public lastRound;
    uint256 public lastWord;
    bool public fulfilled;

    function fulfillRandomness(uint256 round, uint256 word) external override {
        lastRound = round;
        lastWord = word;
        fulfilled = true;
    }
}

contract RandomnessTest is Test {
    CommitRevealRandomness rng;
    MockConsumer consumer;

    address owner = makeAddr("owner");
    address operator = makeAddr("operator");
    address rando = makeAddr("rando");

    bytes32 secret = keccak256("super-secret-entropy-32-bytes-xx");

    function setUp() public {
        vm.prank(owner);
        rng = new CommitRevealRandomness(owner);
        consumer = new MockConsumer();
        vm.startPrank(owner);
        rng.setConsumer(address(consumer));
        rng.setOperator(operator);
        vm.stopPrank();
    }

    function _commit(bytes32 s) internal {
        vm.prank(operator);
        rng.commit(keccak256(abi.encode(s)));
    }

    function test_happyPath_fulfillsUnpredictableWord() public {
        _commit(secret);
        // Consumer requests randomness for round 1 (pins commit #0 + this block).
        vm.prank(address(consumer));
        rng.requestRandomness(1);

        // Reveal must be in a later block.
        vm.roll(block.number + 1);
        (uint256 idx, uint256 reqBlock,) = rng.pending(1);
        assertEq(idx, 0);

        vm.prank(operator);
        rng.reveal(1, secret);

        assertTrue(consumer.fulfilled(), "consumer got the callback");
        assertEq(consumer.lastRound(), 1);
        uint256 expected = uint256(keccak256(abi.encode(secret, blockhash(reqBlock), uint256(1), address(rng))));
        assertEq(consumer.lastWord(), expected, "word = H(secret, blockhash, round, self)");
    }

    function test_wrongSecretReverts() public {
        _commit(secret);
        vm.prank(address(consumer));
        rng.requestRandomness(1);
        vm.roll(block.number + 1);
        vm.prank(operator);
        vm.expectRevert(CommitRevealRandomness.BadReveal.selector);
        rng.reveal(1, keccak256("not-the-secret"));
    }

    function test_ownerCannotChooseWord() public {
        // The owner has no reveal power and cannot commit — only the operator can, and even then the
        // word is bound by a future blockhash it could not know at commit time.
        _commit(secret);
        vm.prank(address(consumer));
        rng.requestRandomness(1);
        vm.roll(block.number + 1);
        vm.prank(owner);
        vm.expectRevert(CommitRevealRandomness.NotOperator.selector);
        rng.reveal(1, secret);
    }

    function test_onlyConsumerCanRequest() public {
        _commit(secret);
        vm.prank(rando);
        vm.expectRevert(CommitRevealRandomness.NotConsumer.selector);
        rng.requestRandomness(1);
    }

    function test_cannotRevealSameBlock() public {
        _commit(secret);
        vm.prank(address(consumer));
        rng.requestRandomness(1);
        // No roll → same block as the request → blockhash(requestBlock) not yet available.
        vm.prank(operator);
        vm.expectRevert(CommitRevealRandomness.TooEarly.selector);
        rng.reveal(1, secret);
    }

    function test_cannotRevealTwice() public {
        _commit(secret);
        vm.prank(address(consumer));
        rng.requestRandomness(1);
        vm.roll(block.number + 1);
        vm.prank(operator);
        rng.reveal(1, secret);
        vm.prank(operator);
        vm.expectRevert(CommitRevealRandomness.AlreadyFulfilled.selector);
        rng.reveal(1, secret);
    }

    function test_reRequestAfterDeadlineSlashesBond() public {
        // Two commitments queued so reRequest can re-pin to the next one.
        _commit(secret);
        _commit(keccak256("second-secret"));
        rng.fundBond{value: 1 ether}();

        vm.prank(address(consumer));
        rng.requestRandomness(1);
        (, uint256 reqBlock0,) = rng.pending(1);

        // Before the deadline, reRequest is not allowed.
        vm.roll(reqBlock0 + rng.revealDeadlineBlocks());
        vm.prank(rando);
        vm.expectRevert(CommitRevealRandomness.DeadlineNotPassed.selector);
        rng.reRequest(1);

        // After the deadline, anyone can re-pin; caller collects the 10% slash.
        vm.roll(reqBlock0 + rng.revealDeadlineBlocks() + 1);
        uint256 balBefore = rando.balance;
        vm.prank(rando);
        rng.reRequest(1);

        assertEq(rando.balance - balBefore, 0.1 ether, "10% of 1 ETH bond slashed to caller");
        assertEq(rng.bond(), 0.9 ether, "bond reduced");
        (uint256 idx1, uint256 reqBlock1,) = rng.pending(1);
        assertEq(idx1, 1, "re-pinned to the next queued commitment");
        assertGt(reqBlock1, reqBlock0, "fresh request block");
    }

    function test_deadlinePassedRevealReverts() public {
        _commit(secret);
        vm.prank(address(consumer));
        rng.requestRandomness(1);
        (, uint256 reqBlock,) = rng.pending(1);
        vm.roll(reqBlock + rng.revealDeadlineBlocks() + 1);
        vm.prank(operator);
        vm.expectRevert(CommitRevealRandomness.DeadlinePassed.selector);
        rng.reveal(1, secret);
    }

    function test_requestWithoutCommitmentReverts() public {
        vm.prank(address(consumer));
        vm.expectRevert(CommitRevealRandomness.NoCommitmentQueued.selector);
        rng.requestRandomness(1);
    }
}
