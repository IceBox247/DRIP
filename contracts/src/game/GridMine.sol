// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.26;

/// @title GridMine
/// @notice ORE-style 5×5 grid game for DRIP on Robinhood Chain. Each ~60s round, players deploy the
///         deploy asset (USDG by default) onto tiles; a secure RNG picks one winning tile; losers'
///         stakes are redistributed to winners on that tile (minus a protocol cut), plus a fixed
///         DRIP emission from the EmissionsReserve and an occasional motherlode jackpot. See
///         docs/GRID-MINE.md.
///
/// @dev ⚠️ REAL-MONEY GAME OF CHANCE — see docs/BLOCKERS.md #4 (gambling law). Skeleton only; not
///      audited, not for mainnet. Logic below is stubbed with TODOs.
///
/// Design invariants (must hold in the implementation):
///   - Owner can NEVER pick or bias the winning tile.
///   - Winner is unpredictable: RNG via Chainlink VRF (if available) or bonded commit–reveal — NEVER
///     from blockhash/timestamp/block.number alone (DECISIONS #9).
///   - Round timing via timestamps (grace window) or ArbSys(0x64).arbBlockNumber(), NOT block.number.
///   - Emissions are PAID FROM EmissionsReserve (pre-funded, fixed supply) — GridMine does not mint.
///   - Every payout path is permissionless-safe and reentrancy-safe (SafeERC20, checks-effects-interactions).
contract GridMine {
    uint8 public constant TILES = 25; // 5×5
    uint32 public constant ROUND_SECONDS = 60;
    uint16 public constant LOSER_CUT_BPS = 1000; // 10% of loser pot → protocol (buyback)
    uint16 public constant BPS_DENOMINATOR = 10_000;

    // Motherlode: +MOTHERLODE_PER_ROUND each round; 1-in-MOTHERLODE_ODDS chance it dumps.
    uint16 public constant MOTHERLODE_ODDS = 625; // 1/625

    enum RoundState { Open, Closing, Settled }

    event RoundOpened(uint256 indexed round, uint256 endsAt);
    event Deployed(uint256 indexed round, address indexed player, uint8 tile, uint256 amount);
    event RoundSettled(uint256 indexed round, uint8 winningTile, uint256 winnerPot, uint256 protocolCut, uint256 emission, bool motherlode);

    // address public immutable deployAsset;      // USDG by default (DECISIONS #10)
    // IEmissionsReserve public immutable reserve;
    // IRefiningVault public immutable refining;
    // IBuyback public immutable buyback;
    // uint256 public currentRound;
    // mapping(uint256 => mapping(uint8 => uint256)) public tileTotal;       // round → tile → total staked
    // mapping(uint256 => mapping(uint8 => mapping(address => uint256))) public stake; // round → tile → player → amount

    /// @notice Stake `amount` of the deploy asset onto `tile` in the current open round.
    /// @dev TODO: pull asset via SafeERC20; require round Open and not past endsAt; accumulate stake.
    function deploy(uint8 tile, uint256 amount) external {
        tile;
        amount;
        revert("GridMine: not implemented");
    }

    /// @notice Close the current round and request randomness (VRF request or commit-reveal open).
    /// @dev Permissionless: anyone/keeper may call once endsAt has passed. TODO.
    function closeRound() external {
        revert("GridMine: not implemented");
    }

    /// @notice Settle using the delivered randomness: pick winning tile, split pot, pull emission
    ///         from the reserve into the RefiningVault, route protocol cut to Buyback, handle
    ///         motherlode. TODO. MUST be callable only after randomness is finalized for the round.
    /// @param round The round being settled.
    function settle(uint256 round) external {
        round;
        revert("GridMine: not implemented");
    }
}
