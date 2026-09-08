// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title StakeVault
/// @notice Stake DRIP, earn the DRIP rewards routed here by Buyback. Standard accumulator
///         (reward-per-share) accounting. This is the holder sink that discourages minute-by-minute
///         dumping. See docs/GRID-MINE.md.
/// @dev `notify(amount)` assumes `amount` DRIP was already transferred in (Buyback does that). If no
///      one is staked yet, rewards queue and fold in once there is stake.
contract StakeVault is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 private constant ACC = 1e18;
    IERC20 public immutable drip;

    uint256 public totalStaked;
    uint256 public accRewardPerShare;
    uint256 public pendingRewards; // rewards received while nobody was staked
    mapping(address => uint256) public staked;
    mapping(address => uint256) public rewardDebt;
    mapping(address => uint256) public owed;

    event Staked(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event RewardPaid(address indexed user, uint256 amount);
    event Notified(uint256 amount);

    error ZeroAmount();
    error InsufficientStake();

    constructor(IERC20 drip_) {
        drip = drip_;
    }

    function _update(address a) internal {
        owed[a] += (staked[a] * accRewardPerShare) / ACC - rewardDebt[a];
        rewardDebt[a] = (staked[a] * accRewardPerShare) / ACC;
    }

    function _foldPending() internal {
        if (pendingRewards > 0 && totalStaked > 0) {
            accRewardPerShare += (pendingRewards * ACC) / totalStaked;
            pendingRewards = 0;
        }
    }

    /// @notice Distribute `amount` DRIP (already transferred in) to current stakers.
    function notify(uint256 amount) external {
        pendingRewards += amount;
        _foldPending();
        emit Notified(amount);
    }

    function stake(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        _update(msg.sender);
        drip.safeTransferFrom(msg.sender, address(this), amount);
        staked[msg.sender] += amount;
        totalStaked += amount;
        rewardDebt[msg.sender] = (staked[msg.sender] * accRewardPerShare) / ACC;
        _foldPending();
        emit Staked(msg.sender, amount);
    }

    function withdraw(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (amount > staked[msg.sender]) revert InsufficientStake();
        _update(msg.sender);
        staked[msg.sender] -= amount;
        totalStaked -= amount;
        rewardDebt[msg.sender] = (staked[msg.sender] * accRewardPerShare) / ACC;
        drip.safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    function getReward() external nonReentrant returns (uint256 reward) {
        _update(msg.sender);
        reward = owed[msg.sender];
        if (reward > 0) {
            owed[msg.sender] = 0;
            drip.safeTransfer(msg.sender, reward);
            emit RewardPaid(msg.sender, reward);
        }
    }

    function earned(address a) external view returns (uint256) {
        return owed[a] + (staked[a] * accRewardPerShare) / ACC - rewardDebt[a];
    }
}
