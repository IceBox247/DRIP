// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {DripMineToken} from "./DripMineToken.sol";
import {RefiningVault} from "./RefiningVault.sol";
import {IRandomnessSource, IRandomnessConsumer} from "./interfaces/IRandomnessSource.sol";

/// @title GridMine
/// @notice ORE-style 5×5 grid game for DRIP on Robinhood Chain (docs/GRID-MINE.md). Each round,
///         players deploy USDG onto 25 tiles; a secure RNG picks one winning tile; losers' USDG is
///         redistributed to winners on that tile (minus admin + protocol cut), each round emits
///         DRIP to winners, and an occasional motherlode jackpot pays out. Winners `harvest` (pull
///         payment) — no on-chain loop over players.
///
/// @dev ⚠️ REAL-MONEY GAME OF CHANCE — see docs/BLOCKERS.md #4 (gambling). Testnet only until
///      gambling counsel + licensing + geoblock. v1 always splits the DRIP emission pro-rata
///      (no solo-winner). Randomness is injected via IRandomnessSource (VRF or commit–reveal); the
///      owner can NEVER pick the tile. Round timing uses block.timestamp windows, not block.number.
///
/// Safety invariants enforced/relied upon:
///   - Owner cannot pick or bias the winning tile, cannot seize user USDG, cannot shorten rounds.
///   - fulfillRandomness is restricted to the configured randomness source.
///   - Pause only blocks new deploys; harvests/withdrawals always work.
contract GridMine is IRandomnessConsumer, ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    uint8 public constant TILES = 25;
    uint32 public constant ROUND_SECONDS = 60;
    uint16 public constant ADMIN_BPS = 100; // 1% of gross
    uint16 public constant PROTO_BPS = 1000; // 10% of loser pot
    uint16 public constant BPS = 10_000;
    uint256 public constant EMISSION = 1 ether; // DRIP per round to winners
    uint256 public constant MOTHERLODE_ADD = 0.2 ether; // DRIP added to jackpot each settled round
    uint16 public constant MOTHERLODE_ODDS = 625; // 1 / 625 chance to hit

    enum Status { Open, Closed, Settled }

    struct Round {
        uint64 startTime;
        Status status;
        uint8 winningTile;
        bool motherlodeHit;
        uint256 totalIn; // gross USDG deployed
        uint256 winnerStake; // USDG on the winning tile
        uint256 winnerPot; // USDG redistributed to winners (excl. their own principal)
        uint256 motherlodeSnapshot; // DRIP jackpot captured if hit this round
    }

    IERC20 public immutable usdg;
    DripMineToken public immutable drip;
    RefiningVault public immutable refining;
    IRandomnessSource public immutable randomness;
    address public immutable buyback; // receives the protocol cut (USDG) for buyback+burn
    address public immutable adminTreasury; // receives the 1% admin fee

    uint256 public currentRound;
    uint256 public motherlode; // global DRIP jackpot accumulator
    bool public paused; // blocks new deploys only

    mapping(uint256 => Round) public rounds;
    mapping(uint256 => mapping(uint8 => uint256)) public tileTotal; // round => tile => USDG
    mapping(uint256 => mapping(uint8 => mapping(address => uint256))) public stakeOf; // round=>tile=>user
    mapping(uint256 => mapping(address => bool)) public harvested;

    event RoundOpened(uint256 indexed round, uint256 startTime);
    event Deployed(uint256 indexed round, address indexed player, uint8 tile, uint256 amount);
    event RoundClosed(uint256 indexed round);
    event Settled(uint256 indexed round, uint8 winningTile, uint256 winnerPot, uint256 protocolCut, uint256 admin, bool motherlodeHit);
    event Harvested(uint256 indexed round, address indexed player, uint256 usdgOut, uint256 dripOut);
    event PausedSet(bool paused);

    error BadTile();
    error ZeroAmount();
    error RoundNotOpen();
    error RoundClosedForDeploys();
    error WindowNotElapsed();
    error NotRandomnessSource();
    error NotClosed();
    error NotSettled();
    error AlreadyHarvested();
    error NoWinningStake();
    error IsPaused();

    constructor(
        IERC20 usdg_,
        DripMineToken drip_,
        RefiningVault refining_,
        IRandomnessSource randomness_,
        address buyback_,
        address adminTreasury_,
        address owner_
    ) Ownable(owner_) {
        usdg = usdg_;
        drip = drip_;
        refining = refining_;
        randomness = randomness_;
        buyback = buyback_;
        adminTreasury = adminTreasury_;
        _openRound();
    }

    // ── Play ──────────────────────────────────────────────────────────────────

    /// @notice Stake `amount` USDG onto `tile` in the current open round.
    function deploy(uint8 tile, uint256 amount) external nonReentrant {
        if (paused) revert IsPaused();
        if (tile >= TILES) revert BadTile();
        if (amount == 0) revert ZeroAmount();
        Round storage r = rounds[currentRound];
        if (r.status != Status.Open) revert RoundNotOpen();
        if (block.timestamp >= r.startTime + ROUND_SECONDS) revert RoundClosedForDeploys();

        usdg.safeTransferFrom(msg.sender, address(this), amount);
        tileTotal[currentRound][tile] += amount;
        stakeOf[currentRound][tile][msg.sender] += amount;
        r.totalIn += amount;
        emit Deployed(currentRound, msg.sender, tile, amount);
    }

    /// @notice Close the current round once its window elapses, request randomness, open the next.
    ///         Permissionless (keeper or anyone).
    function closeRound() external nonReentrant {
        uint256 rid = currentRound;
        Round storage r = rounds[rid];
        if (r.status != Status.Open) revert RoundNotOpen();
        if (block.timestamp < r.startTime + ROUND_SECONDS) revert WindowNotElapsed();

        if (r.totalIn == 0) {
            r.status = Status.Settled; // empty round: nothing to do
            _openRound();
            emit RoundClosed(rid);
            return;
        }

        r.status = Status.Closed;
        _openRound();
        emit RoundClosed(rid);
        randomness.requestRandomness(rid); // may call back fulfillRandomness synchronously
    }

    /// @notice Randomness callback: pick the winning tile, compute pots, route admin + protocol cut.
    function fulfillRandomness(uint256 round, uint256 word) external override {
        if (msg.sender != address(randomness)) revert NotRandomnessSource();
        Round storage r = rounds[round];
        if (r.status != Status.Closed) revert NotClosed();

        uint8 tile = uint8(word % TILES);
        r.winningTile = tile;
        r.status = Status.Settled;

        uint256 gross = r.totalIn;
        uint256 admin = (gross * ADMIN_BPS) / BPS;
        uint256 workable = gross - admin;
        uint256 winnerStake = tileTotal[round][tile];

        uint256 protocolCut;
        if (winnerStake == 0) {
            // Nobody on the winning tile — no winners. Whole workable pot goes to buyback.
            protocolCut = workable;
        } else {
            uint256 loserPot = workable - winnerStake;
            protocolCut = (loserPot * PROTO_BPS) / BPS;
            r.winnerStake = winnerStake;
            r.winnerPot = loserPot - protocolCut;

            motherlode += MOTHERLODE_ADD;
            if (((word >> 8) % MOTHERLODE_ODDS) == 0) {
                r.motherlodeHit = true;
                r.motherlodeSnapshot = motherlode;
                motherlode = 0;
            }
        }

        if (admin > 0) usdg.safeTransfer(adminTreasury, admin);
        if (protocolCut > 0) usdg.safeTransfer(buyback, protocolCut);
        emit Settled(round, tile, r.winnerPot, protocolCut, admin, r.motherlodeHit);
    }

    /// @notice Winners pull their payout for a settled round: USDG principal + pot share, plus DRIP
    ///         emission (and motherlode share if hit). No-op-revert for non-winners.
    function harvest(uint256 round) external nonReentrant {
        Round storage r = rounds[round];
        if (r.status != Status.Settled) revert NotSettled();
        if (harvested[round][msg.sender]) revert AlreadyHarvested();
        uint256 winnerStake = r.winnerStake;
        if (winnerStake == 0) revert NoWinningStake();
        uint256 s = stakeOf[round][r.winningTile][msg.sender];
        if (s == 0) revert NoWinningStake();

        harvested[round][msg.sender] = true;

        uint256 usdgOut = s + (r.winnerPot * s) / winnerStake;
        uint256 dripOut = (EMISSION * s) / winnerStake;
        if (r.motherlodeHit) dripOut += (r.motherlodeSnapshot * s) / winnerStake;

        usdg.safeTransfer(msg.sender, usdgOut);
        if (dripOut > 0) {
            drip.mint(address(refining), dripOut);
            refining.credit(msg.sender, dripOut);
        }
        emit Harvested(round, msg.sender, usdgOut, dripOut);
    }

    // ── Admin (narrow) ──────────────────────────────────────────────────────────

    /// @notice Pause/unpause NEW deploys only. Cannot touch funds, rounds, or the winner.
    function setPaused(bool p) external onlyOwner {
        paused = p;
        emit PausedSet(p);
    }

    // ── Views ────────────────────────────────────────────────────────────────

    function timeLeft() external view returns (uint256) {
        Round storage r = rounds[currentRound];
        uint256 endsAt = r.startTime + ROUND_SECONDS;
        return block.timestamp >= endsAt ? 0 : endsAt - block.timestamp;
    }

    function getRound(uint256 round) external view returns (Round memory) {
        return rounds[round];
    }

    function _openRound() internal {
        uint256 rid = ++currentRound;
        rounds[rid].startTime = uint64(block.timestamp);
        rounds[rid].status = Status.Open;
        emit RoundOpened(rid, block.timestamp);
    }
}
