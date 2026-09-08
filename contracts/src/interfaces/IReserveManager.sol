// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.26;

/// @title IReserveManager
/// @notice Splits stock acquired each cycle 50/50 (reserve / distribution) and, on low-volume
///         cycles, draws from the reserve at a dynamic rate keyed to reserve health. SPEC §3.
interface IReserveManager {
    /// @notice Reserve health bands, keyed to a fraction of the all-time peak reserve.
    enum Health {
        Low,    // < 20% of peak  -> draw fast (5%)
        Medium, // 20%..60%       -> draw 3-4%
        High    // > 60% of peak  -> draw slow (2%)
    }

    event CycleProcessed(
        uint256 indexed cycle,
        uint256 acquired,      // stock bought this cycle
        uint256 toReserve,     // 50% of acquired
        uint256 toDistribution // 50% of acquired + any drawdown
    );

    event ReserveDraw(uint256 indexed cycle, Health health, uint256 drawn);

    /// @notice Called by the keeper each cycle after the auto-buy swap has delivered `acquired`
    ///         stock tokens to this contract. Applies the 50/50 split and, if `acquired` is low,
    ///         tops up the distribution amount by drawing from the reserve.
    /// @param acquired Amount of Stock Token acquired this cycle (may be 0 on zero-volume cycles).
    /// @return distributable Total stock made available to the distribution pool this cycle.
    function processCycle(uint256 acquired) external returns (uint256 distributable);

    /// @notice Current reserve balance.
    function reserve() external view returns (uint256);

    /// @notice All-time peak reserve, used to compute health bands.
    function peakReserve() external view returns (uint256);

    /// @notice Current health band given the reserve vs. its peak.
    function health() external view returns (Health);
}
