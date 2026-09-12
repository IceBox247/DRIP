// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IGridMineDeployFor {
    function deployManyFor(address player, uint8[] calldata tiles, uint256[] calldata amounts) external;
    function currentRound() external view returns (uint256);
}

/// @title AutoMineVault
/// @notice One-signature auto-mining. A player deposits USDG and a fixed plan (which blocks, how much
///         per block, how many rounds). A keeper then calls `executeFor` once per round to deploy that
///         plan on the player's behalf via GridMine.deployManyFor — so the mining stake is credited to
///         the PLAYER (they harvest their own winnings, exactly as if they'd deployed themselves), with
///         NO per-round signature. The player can `withdraw` any unspent USDG (which also stops the
///         plan) at any time.
///
/// @dev Non-custodial by construction: this vault has NO owner and no admin path. Deposited USDG can
///      only ever (a) be spent onto the depositor's own configured blocks via deployManyFor, or (b) be
///      returned to the depositor via withdraw. Winnings never touch this contract — GridMine pays the
///      credited player directly.
contract AutoMineVault is ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable usdg;
    IGridMineDeployFor public immutable game;

    uint8 public constant TILES = 25;
    /// @dev Must match GridMine.ROUND_SECONDS. Used as the minimum spacing between a plan's deploys so
    ///      the vault mines at most once per round even if the keeper pokes it more often.
    uint32 public constant ROUND_SECONDS = 60;

    struct Plan {
        uint8[] tiles; // blocks to mine each round
        uint256 perTile; // USDG per block per round (gross, before GridMine's 1% entry fee)
        uint32 roundsLeft; // rounds still to auto-mine
        uint256 balance; // USDG on deposit for this player's plan
        uint64 lastDeployAt; // timestamp of the last auto-deploy (one per ROUND_SECONDS)
    }

    mapping(address => Plan) private _plans;

    // Append-only registry of everyone who has ever configured a plan, so a keeper can enumerate who to
    // run without indexing events. `executeFor` is a cheap no-op for inactive/finished entries.
    address[] private _players;
    mapping(address => bool) private _known;

    event Configured(address indexed player, uint256 perTile, uint8 tileCount, uint32 rounds, uint256 balance);
    event Executed(address indexed player, uint256 indexed round, uint256 spent, uint32 roundsLeft);
    event Withdrawn(address indexed player, uint256 amount);

    error BadInput();
    error NoBalance();

    constructor(IERC20 usdg_, IGridMineDeployFor game_) {
        usdg = usdg_;
        game = game_;
        // The game pulls USDG from this vault inside deployManyFor. Approve it once; the vault always
        // controls exactly how much is deployed (perTile × blocks), and only an authorized operator
        // (this vault) can call deployManyFor at all.
        IERC20(address(usdg_)).forceApprove(address(game_), type(uint256).max);
    }

    /// @notice Set up (or replace) your auto-mine plan and fund it. Pulls enough USDG to cover
    ///         `perTile × blocks × rounds`; any USDG already on deposit is rolled into the new plan, so
    ///         only the shortfall is pulled. One approval of USDG to this vault, then one call.
    function configure(uint8[] calldata tiles, uint256 perTile, uint32 rounds) external nonReentrant {
        uint256 n = tiles.length;
        if (n == 0 || n > TILES || perTile == 0 || rounds == 0) revert BadInput();
        for (uint256 i; i < n; i++) {
            if (tiles[i] >= TILES) revert BadInput();
        }
        uint256 need = perTile * n * rounds;

        Plan storage p = _plans[msg.sender];
        if (need > p.balance) {
            uint256 pull = need - p.balance;
            usdg.safeTransferFrom(msg.sender, address(this), pull);
            p.balance += pull; // now == need
        }
        // (if the existing balance already exceeds `need`, the surplus stays and is withdrawable)
        p.tiles = tiles;
        p.perTile = perTile;
        p.roundsLeft = rounds;
        p.lastDeployAt = 0; // allow the first deploy immediately
        if (!_known[msg.sender]) {
            _known[msg.sender] = true;
            _players.push(msg.sender);
        }
        emit Configured(msg.sender, perTile, uint8(n), rounds, p.balance);
    }

    /// @notice Run several players' plans in one transaction (keeper convenience). Returns how many
    ///         actually deployed. Skips any that are inactive/late/out of funds — never reverts on them.
    function executeMany(address[] calldata who) external returns (uint256 count) {
        for (uint256 i; i < who.length; i++) {
            if (executeFor(who[i])) count++;
        }
    }

    /// @notice Keeper entrypoint — run `player`'s plan for the current round, at most once per round.
    ///         Permissionless and safe to poke: it can only ever spend the player's own deposited USDG
    ///         onto the player's own configured blocks, credited to the player. Returns false (no
    ///         revert) when there's nothing to do, so a keeper looping over many players never fails the
    ///         batch on one finished/late plan.
    function executeFor(address player) public nonReentrant returns (bool) {
        Plan storage p = _plans[player];
        uint256 n = p.tiles.length;
        if (n == 0 || p.roundsLeft == 0) return false;
        // At most one deploy per round window.
        if (p.lastDeployAt != 0 && block.timestamp < p.lastDeployAt + ROUND_SECONDS) return false;
        uint256 cost = p.perTile * n;
        if (p.balance < cost) {
            p.roundsLeft = 0; // out of funds — stop the plan (leftover dust stays withdrawable)
            return false;
        }

        // Effects before interaction (reentrancy-safe; also guarded by nonReentrant).
        p.balance -= cost;
        p.roundsLeft -= 1;
        p.lastDeployAt = uint64(block.timestamp);

        uint256[] memory amounts = new uint256[](n);
        for (uint256 i; i < n; i++) {
            amounts[i] = p.perTile;
        }
        game.deployManyFor(player, p.tiles, amounts);

        uint256 round = game.currentRound();
        emit Executed(player, round, cost, p.roundsLeft);
        return true;
    }

    /// @notice Withdraw all of your unspent USDG. This also stops the plan (rounds left → 0).
    function withdraw() external nonReentrant {
        Plan storage p = _plans[msg.sender];
        uint256 bal = p.balance;
        if (bal == 0) revert NoBalance();
        p.balance = 0;
        p.roundsLeft = 0;
        usdg.safeTransfer(msg.sender, bal);
        emit Withdrawn(msg.sender, bal);
    }

    // ── Views ────────────────────────────────────────────────────────────────

    /// @notice The player's current plan. `tiles` is empty when no plan was ever set.
    function planOf(address player)
        external
        view
        returns (uint8[] memory tiles, uint256 perTile, uint32 roundsLeft, uint256 balance, uint64 lastDeployAt)
    {
        Plan storage p = _plans[player];
        return (p.tiles, p.perTile, p.roundsLeft, p.balance, p.lastDeployAt);
    }

    /// @notice True when the player has an active plan the keeper should keep running.
    function isActive(address player) external view returns (bool) {
        Plan storage p = _plans[player];
        return p.roundsLeft > 0 && p.tiles.length > 0 && p.balance >= p.perTile * p.tiles.length;
    }

    /// @notice Every address that has ever configured a plan (for keeper enumeration). Small by nature;
    ///         a keeper can pass this straight into `executeMany`, which no-ops the inactive ones.
    function allPlayers() external view returns (address[] memory) {
        return _players;
    }

    function playersCount() external view returns (uint256) {
        return _players.length;
    }
}
