// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IRandomnessSource, IRandomnessConsumer} from "./interfaces/IRandomnessSource.sol";

/// @title CommitRevealRandomness
/// @notice Bonded commit–reveal randomness source for GridMine (docs/DECISIONS.md #9). Replaces the
///         test-only MockRandomness with a word that is **unpredictable and un-riggable** by both
///         players and the operator, without an external VRF dependency.
///
/// How it stays fair (the two properties that matter for a real-money game):
///   1. Players cannot predict the word — it depends on a `secret` only the operator knows, whose
///      hash was committed BEFORE the round's request block existed.
///   2. The operator cannot rig the word — the secret is fixed at commit time (before the request
///      block), and the final word additionally mixes in `blockhash(requestBlock)`, which did not
///      exist when the secret was committed. So neither party can choose the outcome: the operator
///      picked the secret blind to the future blockhash, and the blockhash is set after the secret
///      is locked. This is why the design mixes the two — **never blockhash/timestamp alone.**
///
/// Griefing (the operator withholds a reveal it doesn't like): each outcome is already pinned by a
/// pre-commitment, so withholding cannot let the operator pick a better result — it can only stall
/// the round. `reRequest` lets anyone, after a deadline, slash a slice of the operator's bond and
/// re-pin the round to the operator's NEXT queued commitment + a fresh request block, yielding a new
/// (still unpredictable) outcome. A rational operator therefore reveals.
///
/// @dev ⚠️ UNAUDITED. Commit–reveal is a real-money security primitive — this MUST be audited before
///      mainnet, and a Chainlink/native VRF should replace it if one is confirmed on Robinhood Chain
///      (DECISIONS #9). Testnet + audit gate per docs/BLOCKERS.md #4.
contract CommitRevealRandomness is IRandomnessSource, Ownable {
    /// @notice The GridMine (or other consumer) this source serves. Set once.
    IRandomnessConsumer public consumer;
    /// @notice The keeper allowed to pre-commit secrets and reveal them.
    address public operator;

    /// @notice How many blocks after a request the operator has to reveal before `reRequest` opens.
    ///         Kept well under 256 so `blockhash(requestBlock)` is still available at reveal time.
    uint256 public revealDeadlineBlocks = 200;

    /// @notice Operator bond held here; a slice is slashed to the caller on each `reRequest`.
    uint256 public bond;
    /// @notice Bond fraction slashed per failed reveal, in basis points (default 10%).
    uint16 public slashBps = 1000;
    uint16 public constant BPS = 10_000;

    /// @dev FIFO queue of the operator's pre-committed hashes. `commitHead` is the next one to assign.
    bytes32[] public commitments;
    uint256 public commitHead;

    struct Pending {
        uint256 commitIndex; // which queued commitment is pinned to this round
        uint256 requestBlock; // block at request; its hash is the un-riggable mixing entropy
        bool fulfilled;
    }

    mapping(uint256 => Pending) public pending; // round => pin

    event ConsumerSet(address consumer);
    event OperatorSet(address operator);
    event Committed(uint256 indexed index, bytes32 commitment);
    event Requested(uint256 indexed round, uint256 commitIndex, uint256 requestBlock);
    event Revealed(uint256 indexed round, uint256 word);
    event ReRequested(uint256 indexed round, uint256 newCommitIndex, uint256 slashed, address to);
    event BondFunded(uint256 amount, uint256 total);
    event BondWithdrawn(uint256 amount);

    error NotConsumer();
    error NotOperator();
    error ConsumerAlreadySet();
    error NoPending();
    error AlreadyFulfilled();
    error NoCommitmentQueued();
    error BadReveal();
    error TooEarly();
    error DeadlineNotPassed();
    error DeadlinePassed();
    error BlockhashUnavailable();

    constructor(address owner_) Ownable(owner_) {}

    // ── Setup (owner) ───────────────────────────────────────────────────────────

    function setConsumer(address c) external onlyOwner {
        if (address(consumer) != address(0)) revert ConsumerAlreadySet();
        consumer = IRandomnessConsumer(c);
        emit ConsumerSet(c);
    }

    function setOperator(address op) external onlyOwner {
        operator = op;
        emit OperatorSet(op);
    }

    function setRevealDeadlineBlocks(uint256 n) external onlyOwner {
        // Must stay < 256 so blockhash(requestBlock) is still readable when a reveal lands.
        require(n > 0 && n < 250, "range");
        revealDeadlineBlocks = n;
    }

    function setSlashBps(uint16 bps) external onlyOwner {
        require(bps <= BPS, "range");
        slashBps = bps;
    }

    // ── Bond ─────────────────────────────────────────────────────────────────────

    /// @notice Fund the operator bond. Anyone may top it up; only the owner can withdraw.
    function fundBond() external payable {
        bond += msg.value;
        emit BondFunded(msg.value, bond);
    }

    function withdrawBond(uint256 amount) external onlyOwner {
        bond -= amount;
        (bool ok,) = payable(owner()).call{value: amount}("");
        require(ok, "xfer");
        emit BondWithdrawn(amount);
    }

    // ── Operator: pre-commit secrets ──────────────────────────────────────────────

    /// @notice Queue a commitment `keccak256(abi.encode(secret))` ahead of time. The operator should
    ///         keep several queued so a request always has one to pin, and must store each `secret`
    ///         off-chain to reveal later. Secrets must be high-entropy (e.g. 32 random bytes).
    function commit(bytes32 c) external {
        if (msg.sender != operator) revert NotOperator();
        commitments.push(c);
        emit Committed(commitments.length - 1, c);
    }

    function commitMany(bytes32[] calldata cs) external {
        if (msg.sender != operator) revert NotOperator();
        for (uint256 i = 0; i < cs.length; i++) {
            commitments.push(cs[i]);
            emit Committed(commitments.length - 1, cs[i]);
        }
    }

    /// @notice Commitments queued and not yet assigned to a round.
    function queuedCommitments() external view returns (uint256) {
        return commitments.length - commitHead;
    }

    // ── Consumer: request ─────────────────────────────────────────────────────────

    /// @inheritdoc IRandomnessSource
    function requestRandomness(uint256 round) external override {
        if (msg.sender != address(consumer)) revert NotConsumer();
        if (commitHead >= commitments.length) revert NoCommitmentQueued();
        uint256 idx = commitHead++;
        pending[round] = Pending({commitIndex: idx, requestBlock: block.number, fulfilled: false});
        emit Requested(round, idx, block.number);
    }

    // ── Operator: reveal → fulfill ────────────────────────────────────────────────

    /// @notice Reveal the pinned commitment's secret to produce the round's word and settle it. Must
    ///         land in a LATER block than the request (so `blockhash(requestBlock)` exists) and before
    ///         the reveal deadline (so the blockhash is still in range).
    function reveal(uint256 round, bytes32 secret) external {
        if (msg.sender != operator) revert NotOperator();
        Pending storage p = pending[round];
        if (p.requestBlock == 0) revert NoPending();
        if (p.fulfilled) revert AlreadyFulfilled();
        if (block.number <= p.requestBlock) revert TooEarly();
        if (block.number > p.requestBlock + revealDeadlineBlocks) revert DeadlinePassed();
        if (keccak256(abi.encode(secret)) != commitments[p.commitIndex]) revert BadReveal();

        bytes32 bh = blockhash(p.requestBlock);
        if (bh == bytes32(0)) revert BlockhashUnavailable(); // too old — must reRequest instead

        p.fulfilled = true;
        uint256 word = uint256(keccak256(abi.encode(secret, bh, round, address(this))));
        emit Revealed(round, word);
        consumer.fulfillRandomness(round, word);
    }

    // ── Anyone: recover from a withheld reveal ────────────────────────────────────

    /// @notice If the operator missed the reveal deadline, slash a slice of bond to the caller and
    ///         re-pin the round to the next queued commitment + a fresh request block. The outcome is
    ///         re-randomised; the operator cannot use withholding to choose a result, only to lose bond.
    function reRequest(uint256 round) external {
        Pending storage p = pending[round];
        if (p.requestBlock == 0) revert NoPending();
        if (p.fulfilled) revert AlreadyFulfilled();
        if (block.number <= p.requestBlock + revealDeadlineBlocks) revert DeadlineNotPassed();
        if (commitHead >= commitments.length) revert NoCommitmentQueued();

        uint256 idx = commitHead++;
        p.commitIndex = idx;
        p.requestBlock = block.number;

        uint256 slashed = (bond * slashBps) / BPS;
        if (slashed > 0) {
            bond -= slashed;
            (bool ok,) = payable(msg.sender).call{value: slashed}("");
            require(ok, "xfer");
        }
        emit ReRequested(round, idx, slashed, msg.sender);
    }
}
