// SPDX-License-Identifier: MIT
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
///   - The 10% loser-pot cut (USDG) is apportioned: 70% BURNED, 10% stakers, 6% winners, 10%
///     motherlode all buy DRIP (Pons seeds the DRIP/USDG pool at launch); the winners' remaining 4%
///     buys NVDA (tokenized NVIDIA). On a 1/625 hit the motherlode is added to the winners' DRIP.
///     The DRIP and NVDA rewards share the same 1-or-all flip (NVDA has no motherlode).
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
    // Split of the 10% cut (bps of the cut). Most buys DRIP; the winners' slice is paid 6% as DRIP
    // + 4% as NVDA (tokenized NVIDIA), bought from the cut. Burn/stakers/motherlode unchanged.
    uint16 public constant BURN_BPS = 7000; // 70% → buys DRIP, burned
    uint16 public constant STAKERS_BPS = 1000; // 10% → buys DRIP, to stakers
    uint16 public constant WINNERS_BPS = 600; // 6% → buys DRIP, to this round's winners
    uint16 public constant MOTHERLODE_BPS = 1000; // 10% → buys DRIP, to the motherlode
    uint16 public constant WINNERS_NVDA_BPS = 400; // 4% → buys NVDA, to this round's winners
    uint16 public constant DRIP_BPS = 9600; // BURN+STAKERS+WINNERS+MOTHERLODE: the DRIP portion of the cut
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
        uint256 cutUsdg; // 10% of loser pot → swap to DRIP (+ NVDA slice)
        uint256 rewardDrip; // winner DRIP for the round (set at processRewards), held in RefiningVault
        uint256 rewardNvda; // winner NVDA for the round (4% slice), held in this contract
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
    IERC20 public immutable nvda; // tokenized NVIDIA — the winners' 4% stock reward
    RefiningVault public immutable refining;
    StakeVault public immutable stakeVault;
    ISwapRouter public immutable router;
    IRandomnessSource public immutable randomness;
    address public immutable marketing;

    uint256 public currentRound;
    uint256 public motherlodeDrip; // DRIP jackpot pool (bought, not minted)
    uint256 public adminAccrued; // 1% entry fees skimmed at deploy, awaiting withdrawal to marketing
    bool public paused;

    mapping(uint256 => Round) public rounds;
    mapping(uint256 => mapping(uint8 => uint256)) public tileTotal;
    mapping(uint256 => mapping(uint8 => mapping(address => uint256))) public stakeOf;
    mapping(uint256 => mapping(uint8 => Seg[])) private _segs; // round => tile => cumulative segments
    mapping(uint256 => mapping(address => bool)) public usdgClaimed;
    mapping(uint256 => mapping(address => bool)) public dripClaimed;
    mapping(uint256 => mapping(address => bool)) public nvdaClaimed;

    event RoundOpened(uint256 indexed round, uint256 startTime);
    event Deployed(uint256 indexed round, address indexed player, uint8 tile, uint256 amount);
    event RoundClosed(uint256 indexed round);
    event Settled(uint256 indexed round, uint8 winningTile, uint256 winnerPotUsdg, uint256 cutUsdg, bool motherlodeHit);
    event MarketingWithdrawn(uint256 amount);
    event RewardsProcessed(uint256 indexed round, uint256 usdgIn, uint256 dripBought, uint256 burned, uint256 toStakers, uint256 toWinners);
    event HarvestedUsdg(uint256 indexed round, address indexed player, uint256 usdgOut);
    event HarvestedDrip(uint256 indexed round, address indexed player, uint256 dripOut);
    event HarvestedNvda(uint256 indexed round, address indexed player, uint256 nvdaOut);
    event PausedSet(bool paused);

    error BadTile();
    error BadInput();
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
        IERC20 nvda_,
        RefiningVault refining_,
        StakeVault stakeVault_,
        ISwapRouter router_,
        IRandomnessSource randomness_,
        address marketing_,
        address owner_
    ) Ownable(owner_) {
        usdg = usdg_;
        drip = drip_;
        nvda = nvda_;
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
        _rollIfElapsed(); // auto-settle a finished round + open a fresh one, in this same tx
        Round storage r = rounds[currentRound];
        _startClockIfFirst(r);
        usdg.safeTransferFrom(msg.sender, address(this), amount);
        _record(r, tile, amount);
    }

    /// @notice Deploy onto several tiles in ONE transaction — one USDG transfer for the sum, then the
    ///         per-tile accounting. Lets a player cover many tiles with a single signature (important
    ///         when a round is only 60s). `tiles[i]` gets `amounts[i]`.
    function deployMany(uint8[] calldata tiles, uint256[] calldata amounts) external nonReentrant {
        if (paused) revert IsPaused();
        uint256 n = tiles.length;
        if (n == 0 || n != amounts.length) revert BadInput();
        _rollIfElapsed(); // auto-settle a finished round + open a fresh one, in this same tx
        Round storage r = rounds[currentRound];
        uint256 gross;
        for (uint256 i; i < n; i++) {
            if (amounts[i] == 0) revert ZeroAmount();
            if (tiles[i] >= TILES) revert BadTile();
            gross += amounts[i];
        }
        _startClockIfFirst(r);
        usdg.safeTransferFrom(msg.sender, address(this), gross); // one transfer for the whole batch
        for (uint256 i; i < n; i++) {
            _record(r, tiles[i], amounts[i]);
        }
    }

    /// @dev If the current round's 60s window has elapsed, settle it and open a fresh one — so the
    ///      NEXT deploy lands in a new round automatically. This is what makes rounds flow with no
    ///      keeper and no manual "next round" step: deploying drives the game forward.
    function _rollIfElapsed() internal {
        Round storage r = rounds[currentRound];
        if (r.status == Status.Open && r.startTime != 0 && block.timestamp >= r.startTime + ROUND_SECONDS) {
            _close(currentRound);
        }
    }

    /// @dev The 60s clock starts on the FIRST deploy into a round (ORE-style), not when it opened.
    function _startClockIfFirst(Round storage r) internal {
        if (r.status != Status.Open) revert RoundNotOpen();
        if (r.startTime == 0) r.startTime = uint64(block.timestamp);
    }

    /// @dev Per-tile accounting after USDG is already in the contract. The 1% entry fee is skimmed
    ///      HERE, before funds enter the pool, so it never touches the win/loss math; only the net
    ///      99% is staked. Accrued admin is withdrawn separately and is NOT part of any round's pot.
    function _record(Round storage r, uint8 tile, uint256 amount) internal {
        uint256 admin = (amount * ADMIN_BPS) / BPS;
        uint256 net = amount - admin;
        adminAccrued += admin;
        tileTotal[currentRound][tile] += net;
        stakeOf[currentRound][tile][msg.sender] += net;
        _segs[currentRound][tile].push(Seg(msg.sender, tileTotal[currentRound][tile]));
        r.totalIn += net;
        emit Deployed(currentRound, msg.sender, tile, net);
    }

    /// @notice Settle the current round if its window has elapsed and open the next. Permissionless —
    ///         a keeper MAY call this to settle exactly at 60s, but it is not required: deploying rolls
    ///         a finished round over automatically (see _rollIfElapsed).
    function closeRound() external nonReentrant {
        uint256 rid = currentRound;
        Round storage r = rounds[rid];
        if (r.status != Status.Open) revert RoundNotOpen();
        if (r.startTime == 0 || block.timestamp < r.startTime + ROUND_SECONDS) revert WindowNotElapsed();
        _close(rid);
    }

    function _close(uint256 rid) internal {
        Round storage r = rounds[rid];
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

        // The 1% entry fee was already skimmed at deploy — the pool (totalIn) is pure net stake, so
        // wins/losses are computed with no admin interference.
        uint256 pool = r.totalIn;
        uint256 winnerStake = tileTotal[round][tile];

        if (winnerStake == 0) {
            r.cutUsdg = pool; // no winners → whole pool is burned in processRewards
        } else {
            uint256 loserPot = pool - winnerStake; // losers' net stake
            uint256 cut = (loserPot * CUT_BPS) / BPS;
            r.winnerStake = winnerStake;
            r.winnerPotUsdg = loserPot - cut;
            r.cutUsdg = cut;
            r.motherlodeHit = ((word >> 8) % MOTHERLODE_ODDS) == 0;
            // 1-or-all: 50% one weighted winner takes the DRIP, 50% shared pro-rata (ORE mechanic).
            if (((word >> 16) % SOLO_ODDS) == 0) {
                r.soloMode = true;
                uint256 ticket = (word >> 24) % winnerStake; // weighted by stake
                r.soloWinner = _pickWinner(round, tile, ticket);
            }
        }

        emit Settled(round, tile, r.winnerPotUsdg, r.cutUsdg, r.motherlodeHit);
    }

    /// @notice Buy DRIP (and the winners' NVDA slice) with the round's 10% cut and distribute it
    ///         (burn/stakers/winners-DRIP/motherlode + winners-NVDA). Permissionless; the keeper passes
    ///         `minDripOut` and `minNvdaOut` (from a quoter) for slippage safety.
    function processRewards(uint256 round, uint256 minDripOut, uint256 minNvdaOut) external nonReentrant {
        Round storage r = rounds[round];
        if (r.status != Status.Settled) revert NotSettled();
        if (r.rewardsProcessed) revert AlreadyProcessed();
        r.rewardsProcessed = true;

        uint256 cut = r.cutUsdg;
        if (cut == 0) {
            emit RewardsProcessed(round, 0, 0, 0, 0, 0);
            return;
        }

        if (r.winnerStake == 0) {
            // No winners: no NVDA slice — swap the whole cut to DRIP and burn it.
            usdg.forceApprove(address(router), cut);
            uint256 boughtAll = router.swapExactIn(address(usdg), address(drip), cut, minDripOut);
            IBurnable(address(drip)).burn(boughtAll);
            emit RewardsProcessed(round, cut, boughtAll, boughtAll, 0, 0);
            return;
        }

        // Carve out the winners' 4% NVDA slice; the remaining 96% of the cut buys DRIP.
        uint256 nvdaUsdg = (cut * WINNERS_NVDA_BPS) / BPS;
        uint256 dripUsdg = cut - nvdaUsdg;

        usdg.forceApprove(address(router), dripUsdg);
        uint256 bought = router.swapExactIn(address(usdg), address(drip), dripUsdg, minDripOut);

        // Split the bought DRIP by weight within the DRIP portion (BURN+STAKERS+WINNERS+MOTHERLODE).
        uint256 burnAmt = (bought * BURN_BPS) / DRIP_BPS;
        uint256 stakersAmt = (bought * STAKERS_BPS) / DRIP_BPS;
        uint256 winnersAmt = (bought * WINNERS_BPS) / DRIP_BPS;
        uint256 motherAmt = bought - burnAmt - stakersAmt - winnersAmt; // remainder

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

        // Buy the winners' NVDA and park it here for harvest (1-or-all like the DRIP; no motherlode).
        if (nvdaUsdg > 0) {
            usdg.forceApprove(address(router), nvdaUsdg);
            r.rewardNvda = router.swapExactIn(address(usdg), address(nvda), nvdaUsdg, minNvdaOut);
        }

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
        if (r.rewardsProcessed && !nvdaClaimed[round][msg.sender]) {
            nvdaClaimed[round][msg.sender] = true;
            // NVDA follows the same 1-or-all as the DRIP (no motherlode), paid directly (no refine tax).
            uint256 nvdaOut = r.soloMode
                ? (msg.sender == r.soloWinner ? r.rewardNvda : 0)
                : (r.rewardNvda * s) / winnerStake;
            if (nvdaOut > 0) {
                nvda.safeTransfer(msg.sender, nvdaOut);
                emit HarvestedNvda(round, msg.sender, nvdaOut);
                did = true;
            }
        }
        if (!did) revert NothingToHarvest();
    }

    // ── Admin (narrow) + views ──────────────────────────────────────────────────

    function setPaused(bool p) external onlyOwner {
        paused = p;
        emit PausedSet(p);
    }

    /// @notice Send accrued 1% entry fees to the marketing/ops wallet. Permissionless — the funds
    ///         can only ever go to the fixed `marketing` address, never to the caller.
    function withdrawMarketing() external nonReentrant {
        uint256 amt = adminAccrued;
        if (amt == 0) return;
        adminAccrued = 0;
        usdg.safeTransfer(marketing, amt);
        emit MarketingWithdrawn(amt);
    }

    function timeLeft() external view returns (uint256) {
        uint64 start = rounds[currentRound].startTime;
        if (start == 0) return ROUND_SECONDS; // not started — waiting for the first deploy
        uint256 endsAt = start + ROUND_SECONDS;
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

    // A fresh round opens with startTime = 0 = "clock not started". The 60s countdown begins on the
    // FIRST deploy (ORE-style), and the round then rolls over automatically on the next deploy after
    // it elapses — no keeper or "next round" button needed to keep play flowing.
    function _openRound() internal {
        uint256 rid = ++currentRound;
        rounds[rid].startTime = 0;
        rounds[rid].status = Status.Open;
        emit RoundOpened(rid, block.timestamp);
    }
}
