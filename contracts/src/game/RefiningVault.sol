// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title RefiningVault
/// @notice Holds winners' unrefined DRIP. Claiming costs REFINE_FEE_BPS (10%), redistributed to
///         everyone who has NOT yet claimed — fast sellers subsidize diamond hands (ORE "refining").
/// @dev Accounting is the MasterChef reward-per-share pattern over unclaimed balances ("shares"):
///      each claim's fee raises `accTaxPerShare`; a holder's earned tax folds into their claimable
///      principal on their next interaction. Invariant: sum of every account's claimable == the
///      DRIP the vault holds (minus any fee routed to `feeSink` when no one is left to receive it).
contract RefiningVault is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint16 public constant REFINE_FEE_BPS = 1000; // 10%
    uint16 public constant BPS = 10_000;
    uint256 private constant ACC = 1e18;

    IERC20 public immutable drip;
    address public gridMine; // only creditor; set once after deploy (GridMine<->vault cycle)
    address public immutable admin; // may set gridMine exactly once
    address public feeSink; // receives fee when no unclaimed holders remain (e.g. buyback/burn)

    uint256 public totalShares; // total unclaimed principal
    uint256 public accTaxPerShare; // 1e18-scaled
    mapping(address => uint256) public shares; // unclaimed principal (excludes un-folded tax)
    mapping(address => uint256) public rewardDebt;

    event Credited(address indexed account, uint256 amount);
    event Claimed(address indexed account, uint256 net, uint256 fee);

    error NotGridMine();
    error InsufficientBalance();
    error NotAdmin();
    error GridMineAlreadySet();
    error ZeroAddress();

    event GridMineSet(address indexed gridMine);

    constructor(IERC20 drip_, address feeSink_) {
        drip = drip_;
        admin = msg.sender;
        feeSink = feeSink_;
    }

    /// @notice Wire the GridMine contract exactly once (resolves the GridMine<->vault deploy cycle).
    function setGridMine(address gridMine_) external {
        if (msg.sender != admin) revert NotAdmin();
        if (gridMine != address(0)) revert GridMineAlreadySet();
        if (gridMine_ == address(0)) revert ZeroAddress();
        gridMine = gridMine_;
        emit GridMineSet(gridMine_);
    }

    function _pending(address a) internal view returns (uint256) {
        return (shares[a] * accTaxPerShare) / ACC - rewardDebt[a];
    }

    function _fold(address a) internal {
        uint256 p = _pending(a);
        if (p > 0) {
            shares[a] += p;
            totalShares += p;
        }
        rewardDebt[a] = (shares[a] * accTaxPerShare) / ACC;
    }

    /// @notice Gross claimable (before the refining fee) for `account`.
    function claimable(address account) external view returns (uint256) {
        return shares[account] + _pending(account);
    }

    /// @notice Credit unrefined DRIP to a winner. Only GridMine (which must have transferred/minted
    ///         the DRIP to this vault first).
    function credit(address account, uint256 amount) external {
        if (msg.sender != gridMine) revert NotGridMine();
        if (amount == 0) return;
        _fold(account);
        shares[account] += amount;
        totalShares += amount;
        rewardDebt[account] = (shares[account] * accTaxPerShare) / ACC;
        emit Credited(account, amount);
    }

    /// @notice Claim `amount` of your unrefined DRIP, paying the 10% refining fee to remaining
    ///         unclaimed holders.
    function claim(uint256 amount) external nonReentrant {
        _fold(msg.sender);
        if (amount == 0 || amount > shares[msg.sender]) revert InsufficientBalance();

        shares[msg.sender] -= amount;
        totalShares -= amount;
        rewardDebt[msg.sender] = (shares[msg.sender] * accTaxPerShare) / ACC;

        uint256 fee = (amount * REFINE_FEE_BPS) / BPS;
        uint256 net = amount - fee;

        if (fee > 0) {
            if (totalShares > 0) {
                accTaxPerShare += (fee * ACC) / totalShares;
            } else {
                drip.safeTransfer(feeSink, fee); // no one left to receive it
            }
        }
        drip.safeTransfer(msg.sender, net);
        emit Claimed(msg.sender, net, fee);
    }
}
