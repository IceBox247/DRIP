// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.26;

// import {BaseHook} from "v4-periphery/base/hooks/BaseHook.sol";
// import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
// import {Hooks} from "v4-core/libraries/Hooks.sol";
// import {PoolKey} from "v4-core/types/PoolKey.sol";
// import {IFeeRouter} from "../interfaces/IFeeRouter.sol";

/// @title DripFeeHook
/// @notice Uniswap v4 hook that levies the 4% Drip trade fee on swaps and forwards it to the
///         `FeeRouter`. Charging at swap time (rather than in the token's `transfer()`) keeps DRIP
///         a standard ERC-20 and avoids breaking DEX routers. SPEC §2.1.
/// @dev    Robinhood Chain provides Uniswap v4. This is the intended, router-safe place for the fee.
///
/// TODO(Phase 1):
///   - Inherit BaseHook once `forge install Uniswap/v4-core Uniswap/v4-periphery` is run.
///   - Enable the appropriate hook permission (afterSwap / beforeSwap with fee delta) and take the
///     4% as a hook fee, then call IFeeRouter.routeFee.
///   - Deploy at a hook address whose flags match getHookPermissions() (v4 mines the address).
///   - Slippage/donation accounting: ensure the fee delta is settled cleanly with the PoolManager.
///   - Restrict which pools this hook serves (DRIP pairs only).
contract DripFeeHook {
    uint16 public constant FEE_BPS = 400; // 4% — see config/constants.json (fee.totalBps)

    // IFeeRouter public immutable feeRouter;
    // constructor(IPoolManager _poolManager, IFeeRouter _feeRouter) BaseHook(_poolManager) { ... }

    // function getHookPermissions() public pure returns (Hooks.Permissions memory) { ... }
    // function _afterSwap(...) internal override returns (bytes4, int128) { ... routeFee ... }
}
