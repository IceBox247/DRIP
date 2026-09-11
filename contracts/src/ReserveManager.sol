// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IReserveManager} from "./interfaces/IReserveManager.sol";

/// @title ReserveManager
/// @notice Smoothing buffer that keeps rewards flowing on zero-volume days (SPEC §3). Each cycle it
///         splits newly acquired stock 50/50 (reserve / distribution); on low-volume cycles it draws
///         from the reserve at a dynamic rate keyed to reserve health.
/// @dev    Draw table (SPEC §3), as % of the current reserve per cycle:
///           High   (> 60% of peak):  2%
///           Medium (20%..60%):       3-4%
///           Low    (< 20% of peak):  5%
///         Rationale: high reserve -> drip slowly; low reserve -> release faster to stay engaging
///         without emptying it.
///
/// TODO(Phase 3, gated by BLOCKERS #1 — Stock Token transferability):
///   - Wire the Stock Token; only the keeper may call processCycle; move splits with SafeERC20.
///   - Track peakReserve as a high-water mark; compute health() from reserve vs. peakReserve.
///   - Apply the draw table via bps constants (config/constants.json reserve.*), with the Medium
///     band's exact rate pinned (spec gives 3-4%).
contract ReserveManager is IReserveManager {
    uint16 public constant SPLIT_RESERVE_BPS = 5000; // 50%
    uint16 public constant SPLIT_DISTRIBUTE_BPS = 5000; // 50%

    uint16 public constant DRAW_HIGH_BPS = 200; // 2%
    uint16 public constant DRAW_MEDIUM_BPS = 350; // 3.5% (spec: 3-4%, pin before launch)
    uint16 public constant DRAW_LOW_BPS = 500; // 5%

    uint16 public constant HEALTH_HIGH_THRESHOLD_BPS = 6000; // > 60% of peak
    uint16 public constant HEALTH_LOW_THRESHOLD_BPS = 2000; // < 20% of peak

    /// @inheritdoc IReserveManager
    function processCycle(uint256 acquired) external override returns (uint256 distributable) {
        // TODO(Phase 3):
        //   toReserve = acquired * 50%; reserve += toReserve; update peak.
        //   distributable = acquired - toReserve;
        //   if (acquired low) distributable += draw(reserve, drawBpsForHealth());
        //   emit CycleProcessed / ReserveDraw.
        acquired;
        revert("ReserveManager: not implemented");
    }

    /// @inheritdoc IReserveManager
    function reserve() external view override returns (uint256) {
        return 0;
    }

    /// @inheritdoc IReserveManager
    function peakReserve() external view override returns (uint256) {
        return 0;
    }

    /// @inheritdoc IReserveManager
    function health() external view override returns (Health) {
        return Health.High;
    }
}
