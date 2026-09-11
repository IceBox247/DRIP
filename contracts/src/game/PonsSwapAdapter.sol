// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ISwapRouter} from "./interfaces/ISwapRouter.sol";
import {IPonsBondingCurve} from "./interfaces/IPonsBondingCurve.sol";
import {IPoolManager, IUnlockCallback, PoolKey, SwapParams} from "./interfaces/IUniswapV4.sol";

/// @title PonsSwapAdapter
/// @notice Real swap router for GridMine on Robinhood Chain. Turns the round's quote asset (USDG)
///         into a reward token by the correct venue for that token:
///           • a **Pons V2 bonding curve** while the token is pre-graduation (e.g. DRIP today), or
///           • a **Uniswap v4 pool** (called via the PoolManager directly, since the Universal Router
///             is modified here) for graduated tokens and for stock tokens like NVDA.
///         Implements the same `ISwapRouter.swapExactIn` GridMine already calls, so the game is
///         unchanged — the mock router is simply swapped for this.
///
/// @dev Per reward token the owner registers a curve (`setCurve`) and/or a v4 pool (`setV4Pool`).
///      Routing: use the curve while it exists and hasn't graduated; otherwise use the v4 pool.
///      `minOut` is enforced on both paths. ⚠️ Unaudited real-money code — fork-tested against the
///      live pools; must be audited before a public launch.
contract PonsSwapAdapter is ISwapRouter, IUnlockCallback, Ownable {
    using SafeERC20 for IERC20;

    // v4 price limits (TickMath): min+1 for zeroForOne, max-1 for oneForZero.
    uint160 internal constant MIN_SQRT_PRICE_PLUS_ONE = 4295128740;
    uint160 internal constant MAX_SQRT_PRICE_MINUS_ONE = 1461446703485210103287273052203988822378723970341;

    IPoolManager public immutable poolManager;

    mapping(address => IPonsBondingCurve) public curveFor; // reward token => Pons bonding curve
    mapping(address => PoolKey) public v4PoolFor; // reward token => v4 pool
    mapping(address => bool) public hasV4Pool;

    event CurveSet(address indexed token, address curve);
    event V4PoolSet(address indexed token, address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks);
    event Bought(address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut, bool viaV4);

    error NoRoute();
    error CurveTokenMismatch();
    error QuoteMismatch();
    error NotPoolManager();
    error BadPool();
    error Slippage();

    constructor(address owner_, address poolManager_) Ownable(owner_) {
        poolManager = IPoolManager(poolManager_);
    }

    // ── Config (owner) ────────────────────────────────────────────────────────

    function setCurve(address token, address curve) external onlyOwner {
        if (curve != address(0) && IPonsBondingCurve(curve).token() != token) revert CurveTokenMismatch();
        curveFor[token] = IPonsBondingCurve(curve);
        emit CurveSet(token, curve);
    }

    /// @notice Register the v4 pool used to buy `token`. `key` must actually contain `token`, and
    ///         currency0 < currency1. Values come from the pool's on-chain Initialize event.
    function setV4Pool(address token, PoolKey calldata key) external onlyOwner {
        if (key.currency0 >= key.currency1) revert BadPool();
        if (token != key.currency0 && token != key.currency1) revert BadPool();
        v4PoolFor[token] = key;
        hasV4Pool[token] = true;
        emit V4PoolSet(token, key.currency0, key.currency1, key.fee, key.tickSpacing, key.hooks);
    }

    function clearV4Pool(address token) external onlyOwner {
        delete v4PoolFor[token];
        hasV4Pool[token] = false;
    }

    // ── Swap ────────────────────────────────────────────────────────────────────

    /// @inheritdoc ISwapRouter
    function swapExactIn(address tokenIn, address tokenOut, uint256 amountIn, uint256 minOut)
        external
        override
        returns (uint256 amountOut)
    {
        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);

        IPonsBondingCurve curve = curveFor[tokenOut];
        bool useCurve = address(curve) != address(0) && !curve.graduated();

        if (useCurve) {
            if (curve.pairToken() != tokenIn) revert QuoteMismatch();
            IERC20(tokenIn).forceApprove(address(curve), amountIn);
            amountOut = curve.buy(amountIn, minOut, msg.sender); // reward sent straight to GridMine
            IERC20(tokenIn).forceApprove(address(curve), 0);
            uint256 leftover = IERC20(tokenIn).balanceOf(address(this));
            if (leftover != 0) IERC20(tokenIn).safeTransfer(msg.sender, leftover);
            emit Bought(tokenIn, tokenOut, amountIn, amountOut, false);
            return amountOut;
        }

        if (hasV4Pool[tokenOut]) {
            amountOut = _swapV4(tokenIn, tokenOut, amountIn, minOut, msg.sender);
            emit Bought(tokenIn, tokenOut, amountIn, amountOut, true);
            return amountOut;
        }

        revert NoRoute();
    }

    // ── Uniswap v4 (direct PoolManager) ──────────────────────────────────────────

    function _swapV4(address tokenIn, address tokenOut, uint256 amountIn, uint256 minOut, address recipient)
        internal
        returns (uint256 amountOut)
    {
        PoolKey memory key = v4PoolFor[tokenOut];
        if (tokenIn != key.currency0 && tokenIn != key.currency1) revert QuoteMismatch();
        bool zeroForOne = tokenIn == key.currency0; // buying currency1 with currency0
        bytes memory res = poolManager.unlock(abi.encode(key, zeroForOne, tokenIn, tokenOut, amountIn, recipient));
        amountOut = abi.decode(res, (uint256));
        if (amountOut < minOut) revert Slippage();
    }

    /// @notice PoolManager callback: perform the swap, settle the input, take the output to recipient.
    function unlockCallback(bytes calldata data) external override returns (bytes memory) {
        if (msg.sender != address(poolManager)) revert NotPoolManager();
        (PoolKey memory key, bool zeroForOne, address tokenIn, address tokenOut, uint256 amountIn, address recipient) =
            abi.decode(data, (PoolKey, bool, address, address, uint256, address));

        int256 delta = poolManager.swap(
            key,
            SwapParams({
                zeroForOne: zeroForOne,
                amountSpecified: -int256(amountIn), // negative = exact input
                sqrtPriceLimitX96: zeroForOne ? MIN_SQRT_PRICE_PLUS_ONE : MAX_SQRT_PRICE_MINUS_ONE
            }),
            ""
        );
        // BalanceDelta: amount0 = high int128, amount1 = low int128.
        int128 amount0 = int128(delta >> 128);
        int128 amount1 = int128(delta);
        int128 outDelta = zeroForOne ? amount1 : amount0; // positive = owed to us

        // Settle what we owe (the input token) to the manager.
        poolManager.sync(tokenIn);
        IERC20(tokenIn).safeTransfer(address(poolManager), amountIn);
        poolManager.settle();

        // Take the output to the recipient (GridMine).
        uint256 out = outDelta > 0 ? uint256(uint128(outDelta)) : 0;
        poolManager.take(tokenOut, recipient, out);

        return abi.encode(out);
    }
}
