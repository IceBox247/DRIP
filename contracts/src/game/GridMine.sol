// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {RefiningVault} from "./RefiningVault.sol";
import {StakeVault} from "./StakeVault.sol";
import {ISwapRouter, IBurnable} from "./interfaces/ISwapRouter.sol";
import {IRandomnessSource, IRandomnessConsumer} from "./interfaces/IRandomnessSource.sol";

/// @title GridMine (v2 — bought rewards, no mint)
/// @notice ORE-style 5×5 grid game for DRIP on Robinhood Chain (docs/GRID-MINE.md). Each round,
///         players deploy USDG onto 25 tiles; a secure RNG picks a winning tile; losers' USDG is
///         split, and the protocol **buys DRIP** (never mints) to reward winners, burn, feed stakers
///         and grow the motherlode.
///
/// Economics per round (all tunable via constants):
///   - 1% of gross deploys → marketing/ops (`marketing`).
///   - Winners get their tile principal back + 90% of the loser pot, in USDG (pull payment).
///   - The 10% loser-pot cut (USDG) is swapped to DRIP in the DRIP/USDG pool (Pons seeds it at
///     launch), then that bought DRIP is split: 70% BURNED, 10% to stakers, 10% to this round's
///     winners, 10% to the motherlode. On a 1/625 hit the motherlode is added to the winners' pool.
///   - Winner DRIP accrues in the RefiningVault; claiming it costs a 10% refine tax paid to holders
///     who haven't claimed (ORE mechanic).
///
/// @dev ⚠️ REAL-MONEY GAME OF CHANCE — docs/BLOCKERS.md #4. The DEX swap is behind ISwapRouter (mock
///      in tests; on Robinhood Chain wire a Uniswap v4 adapter that calls PoolManager directly, since
///      the Universal Router is modified — docs/ROBINHOOD-CHAIN.md). Randomness via IRandomnessSource
///      (VRF/commit-reveal); owner can NEVER pick the tile. Nothing is minted — DRIP is fixed supply.
contract GridMine is IRandomnessConsumer, ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    uint8 public constant TILES = 25;
    uint32 public constant ROUND_SECONDS = 60;
    uint16 public constant ADMIN_BPS = 100; // 1% of gross → marketing/ops
    uint16 public constant CUT_BPS = 1000; // 10% of loser pot → buy DRIP (reward engine)
    uint16 public constant BPS = 10_000;
    // Split of the bought DRIP:
    uint16 public constant BURN_BPS = 7000; // 70% burned
    uint16 public constant STAKERS_BPS = 1000; // 10% to stakers
    uint16 public constant WINNERS_BPS = 1000; // 10% to this round's winners
    // motherlode gets the remainder (10%)
    uint16 public constant MOTHERLODE_ODDS = 625; // 1/625
    uint16 public constant SOLO_ODDS = 2; // 1/2: 50% one winner takes the DRIP, 50% shared

    enum Status { Open, Closed, Settled }

    struct Round {
        uint64 startTime;
        Status status;
        uint8 winningTile;
        bool motherlodeHit;
        bool rewardsProcessed;
        bool soloMode; // true = one weighted winner takes all the round DRIP (incl. motherlode)
        address soloWinner; // the picked winner when soloMode (0 = shared)
        uint256 totalIn; // gross USDG
        uint256 winnerStake; // USDG on the winning tile
        uint256 winnerPotUsdg; // 90% of loser pot → winners (USDG), always pro-rata
        uint256 cutUsdg; // 10% of loser pot → swap to DRIP
        uint256 rewardDrip; // winner DRIP for the round (set at processRewards), held in RefiningVault
    }

    /// @dev Cumulative stake segments per tile, for weighted single-winner selection without a loop.
    ///      Each deploy appends {user, cumEnd} where cumEnd is the tile's running total after it; a
    ///      random ticket in [0, winnerStake) lands in exactly one segment (binary search).
    struct Seg {
        address user;
        uint256 cumEnd;
    }

    IERC20 public immutable usdg;
    IERC20 public immutable drip;
    RefiningVault public immutable refining;
    StakeVault public immutable stakeVault;
    ISwapRouter public immutable router;
    IRandomnessSource public immutable randomness;
    address public immutable marketing;

    uint256 public currentRound;
    uint256 public motherlodeDrip; // DRIP jackpot pool (bought, not minted)
    bool public paused;

    mapping(uint256 => Round) public rounds;
    mapping(uint256 => mapping(uint8 => uint256)) public tileTotal;
    mapping(uint256 => mapping(uint8 => mapping(address => uint256))) public stakeOf;
    mapping(uint256 => mapping(uint8 => Seg[])) private _segs; // round => tile => cumulative segments
    mapping(uint256 => mapping(address => bool)) public usdgClaimed;
    mapping(uint256 => mapping(address => bool)) public dripClaimed;

    event RoundOpened(uint256 indexed round, uint256 startTime);
    event Deployed(uint256 indexed round, address indexed player, uint8 tile, uint256 amount);
    event RoundClosed(uint256 indexed round);
    event Settled(uint256 indexed round, uint8 winningTile, uint256 winnerPotUsdg, uint256 cutUsdg, uint256 admin, bool motherlodeHit);
    event RewardsProcessed(uint256 indexed round, uint256 usdgIn, uint256 dripBought, uint256 burned, uint256 toStakers, uint256 toWinners);
    event HarvestedUsdg(uint256 indexed round, address indexed player, uint256 usdgOut);
    event HarvestedDrip(uint256 indexed round, address indexed player, uint256 dripOut);
    event PausedSet(bool paused);

    error BadTile();
    error ZeroAmount();
    error RoundNotOpen();
    error WindowClosed();
    error WindowNotElapsed();
    error NotRandomnessSource();
    error NotClosed();
    error NotSettled();
    error AlreadyProcessed();
    error NotProcessed();
    error NoWinningStake();
    error NothingToHarvest();
    error IsPaused();

    constructor(
        IERC20 usdg_,
        IERC20 drip_,
        RefiningVault refining_,
        StakeVault stakeVault_,
        ISwapRouter router_,
        IRandomnessSource randomness_,
        address marketing_,
        address owner_
    ) Ownable(owner_) {
        usdg = usdg_;
        drip = drip_;
        refining = refining_;
        stakeVault = stakeVault_;
        router = router_;
        randomness = randomness_;
        marketing = marketing_;
        _openRound();
    }

    // ── Play ──────────────────────────────────────────────────────────────────

    function deploy(uint8 tile, uint256 amount) external nonReentrant {
        if (paused) revert IsPaused();
        if (tile >= TILES) revert BadTile();
        if (amount == 0) revert ZeroAmount();
        Round storage r = rounds[currentRound];
        if (r.status != Status.Open) revert RoundNotOpen();
        if (block.timestamp >= r.startTime + ROUND_SECONDS) revert WindowClosed();
        usdg.safeTransferFrom(msg.sender, address(this), amount);
        tileTotal[currentRound][tile] += amount;
        stakeOf[currentRound][tile][msg.sender] += amount;
        _segs[currentRound][tile].push(Seg(msg.sender, tileTotal[currentRound][tile]));
        r.totalIn += amount;
        emit Deployed(currentRound, msg.sender, tile, amount);
    }

    function closeRound() external nonReentrant {
        uint256 rid = currentRound;
        Round storage r = rounds[rid];
        if (r.status != Status.Open) revert RoundNotOpen();
        if (block.timestamp < r.startTime + ROUND_SECONDS) revert WindowNotElapsed();
        if (r.totalIn == 0) {
            r.status = Status.Settled;
            r.rewardsProcessed = true;
            _openRound();
            emit RoundClosed(rid);
            return;
        }
        r.status = Status.Closed;
        _openRound();
        emit RoundClosed(rid);
        randomness.requestRandomness(rid);
    }

    /// @notice RNG callback: pick winner, compute USDG splits, pay the 1% admin, park the 10% cut.
    function fulfillRandomness(uint256 round, uint256 word) external override {
        if (msg.sender != address(randomness)) revert NotRandomnessSource();
        Round storage r = rounds[round];
        if (r.status != Status.Closed) revert NotClosed();

        uint8 tile = uint8(word % TILES);
        r.winningTile = tile;
        r.status = Status.Settled;

        uint256 gross = r.totalIn;
        uint256 winnerStake = tileTotal[round][tile];
        uint256 loserStake = gross - winnerStake; // gross >= winnerStake, never underflows

        // Admin (1% of gross) and everything else come out of the LOSER stake only — winners always
        // get their full principal back. Cap admin at the loser stake so it can never dip into it.
        uint256 admin = (gross * ADMIN_BPS) / BPS;
        if (admin > loserStake) admin = loserStake;
        uint256 remainingLoser = loserStake - admin;

        if (winnerStake == 0) {
            r.cutUsdg = remainingLoser; // no winners → whole remaining pot is burned in processRewards
        } else {
            uint256 cut = (remainingLoser * CUT_BPS) / BPS;
            r.winnerStake = winnerStake;
            r.winnerPotUsdg = remainingLoser - cut;
            r.cutUsdg = cut;
            r.motherlodeHit = ((word >> 8) % MOTHERLODE_ODDS) == 0;
            // 1-or-all: 50% one weighted winner takes the DRIP, 50% shared pro-rata (ORE mechanic).
            if (((word >> 16) % SOLO_ODDS) == 0) {
                r.soloMode = true;
                uint256 ticket = (word >> 24) % winnerStake; // weighted by stake
                r.soloWinner = _pickWinner(round, tile, ticket);
            }
        }

        if (admin > 0) usdg.safeTransfer(marketing, admin);
        emit Settled(round, tile, r.winnerPotUsdg, r.cutUsdg, admin, r.motherlodeHit);
    }

    /// @notice Buy DRIP with the round's 10% cut and distribute it (burn/stakers/winners/motherlode).
    ///         Permissionless; the keeper passes `minDripOut` (from a quoter) for slippage safety.
    function processRewards(uint256 round, uint256 minDripOut) external nonReentrant {
        Round storage r = rounds[round];
        if (r.status != Status.Settled) revert NotSettled();
        if (r.rewardsProcessed) revert AlreadyProcessed();
        r.rewardsProcessed = true;

        uint256 cut = r.cutUsdg;
        if (cut == 0) {
            emit RewardsProcessed(round, 0, 0, 0, 0, 0);
            return;
        }

        usdg.forceApprove(address(router), cut);
        uint256 bought = router.swapExactIn(address(usdg), address(drip), cut, minDripOut);

        if (r.winnerStake == 0) {
            // No winners: burn everything bought.
            IBurnable(address(drip)).burn(bought);
            emit RewardsProcessed(round, cut, bought, bought, 0, 0);
            return;
        }

        uint256 burnAmt = (bought * BURN_BPS) / BPS;
        uint256 stakersAmt = (bought * STAKERS_BPS) / BPS;
        uint256 winnersAmt = (bought * WINNERS_BPS) / BPS;
        uint256 motherAmt = bought - burnAmt - stakersAmt - winnersAmt; // remainder (~10%)

        IBurnable(address(drip)).burn(burnAmt);

        if (stakersAmt > 0) {
            drip.safeTransfer(address(stakeVault), stakersAmt);
            stakeVault.notify(stakersAmt);
        }

        motherlodeDrip += motherAmt;
        uint256 reward = winnersAmt;
        if (r.motherlodeHit) {
            reward += motherlodeDrip;
            motherlodeDrip = 0;
        }
        r.rewardDrip = reward;
        if (reward > 0) drip.safeTransfer(address(refining), reward);

        emit RewardsProcessed(round, cut, bought, burnAmt, stakersAmt, reward);
    }

    /// @notice Winners pull their payout. USDG is available after settle; DRIP after processRewards.
    ///         Callable twice (USDG first, DRIP once rewards are processed).
    function harvest(uint256 round) external nonReentrant {
        Round storage r = rounds[round];
        if (r.status != Status.Settled) revert NotSettled();
        uint256 winnerStake = r.winnerStake;
        if (winnerStake == 0) revert NoWinningStake();
        uint256 s = stakeOf[round][r.winningTile][msg.sender];
        if (s == 0) revert NoWinningStake();

        bool did;
        if (!usdgClaimed[round][msg.sender]) {
            usdgClaimed[round][msg.sender] = true;
            uint256 usdgOut = s + (r.winnerPotUsdg * s) / winnerStake;
            usdg.safeTransfer(msg.sender, usdgOut);
            emit HarvestedUsdg(round, msg.sender, usdgOut);
            did = true;
        }
        if (r.rewardsProcessed && !dripClaimed[round][msg.sender]) {
            dripClaimed[round][msg.sender] = true;
            // USDG pot is always pro-rata; the DRIP reward is 1-or-all per ORE:
            uint256 dripOut = r.soloMode
                ? (msg.sender == r.soloWinner ? r.rewardDrip : 0) // one winner takes it all
                : (r.rewardDrip * s) / winnerStake; // shared pro-rata
            if (dripOut > 0) refining.credit(msg.sender, dripOut); // accrues; claim charges refine tax
            emit HarvestedDrip(round, msg.sender, dripOut);
            did = true;
        }
        if (!did) revert NothingToHarvest();
    }

    // ── Admin (narrow) + views ──────────────────────────────────────────────────

    function setPaused(bool p) external onlyOwner {
        paused = p;
        emit PausedSet(p);
    }

    function timeLeft() external view returns (uint256) {
        uint256 endsAt = rounds[currentRound].startTime + ROUND_SECONDS;
        return block.timestamp >= endsAt ? 0 : endsAt - block.timestamp;
    }

    function getRound(uint256 round) external view returns (Round memory) {
        return rounds[round];
    }

    /// @dev Weighted winner for `ticket` in [0, tileTotal): first segment whose cumEnd > ticket.
    ///      O(log n) reads — no unbounded loop over players.
    function _pickWinner(uint256 round, uint8 tile, uint256 ticket) internal view returns (address) {
        Seg[] storage segs = _segs[round][tile];
        uint256 lo = 0;
        uint256 hi = segs.length;
        while (lo < hi) {
            uint256 mid = (lo + hi) / 2;
            if (segs[mid].cumEnd > ticket) hi = mid;
            else lo = mid + 1;
        }
        return segs[lo].user;
    }

    function _openRound() internal {
        uint256 rid = ++currentRound;
        rounds[rid].startTime = uint64(block.timestamp);
        rounds[rid].status = Status.Open;
        emit RoundOpened(rid, block.timestamp);
    }
}
