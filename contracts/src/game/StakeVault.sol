// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title StakeVault
/// @notice Stake DRIP, earn the DRIP rewards routed here by the game's buyback — but STREAMED over a
///         fixed window, not paid out in one lump. Each buyback tops up the reward rate so rewards
///         drip out continuously (Synthetix "StakingRewards" accounting) instead of everything landing
///         in a single block. This makes staking yield smooth and sustainable rather than spiky.
/// @dev `notify(amount)` assumes `amount` DRIP was already transferred in (the buyback does that) and
///      (re)starts a `REWARD_DURATION` stream: leftover from any active stream is rolled in, so a busy
///      day speeds the rate up and a quiet one slows it, without ever front-loading. Rewards received
///      while nobody is staked are queued and begin streaming once there is stake.
contract StakeVault is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 private constant ACC = 1e18;
    /// @notice How long each buyback is streamed over. 7 days → steady, non-spiky staking yield.
    uint256 public constant REWARD_DURATION = 7 days;

    IERC20 public immutable drip;

    uint256 public totalStaked;
    mapping(address => uint256) public staked;

    // Streaming reward accounting.
    uint256 public rewardRate; // DRIP per second currently streaming
    uint256 public periodFinish; // timestamp the current stream ends
    uint256 public lastUpdateTime; // last time reward accounting advanced
    uint256 public rewardPerTokenStored; // 1e18-scaled cumulative reward per staked DRIP
    uint256 public queued; // rewards received while nobody was staked, awaiting a stream
    mapping(address => uint256) public userRewardPerTokenPaid;
    mapping(address => uint256) public rewards; // settled, claimable rewards per user

    event Staked(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event RewardPaid(address indexed user, uint256 amount);
    event Notified(uint256 amount);

    error ZeroAmount();
    error InsufficientStake();

    constructor(IERC20 drip_) {
        drip = drip_;
    }

    modifier updateReward(address account) {
        rewardPerTokenStored = rewardPerToken();
        lastUpdateTime = lastTimeRewardApplicable();
        if (account != address(0)) {
            rewards[account] = earned(account);
            userRewardPerTokenPaid[account] = rewardPerTokenStored;
        }
        _;
    }

    function lastTimeRewardApplicable() public view returns (uint256) {
        return block.timestamp < periodFinish ? block.timestamp : periodFinish;
    }

    function rewardPerToken() public view returns (uint256) {
        if (totalStaked == 0) return rewardPerTokenStored;
        return rewardPerTokenStored + ((lastTimeRewardApplicable() - lastUpdateTime) * rewardRate * ACC) / totalStaked;
    }

    /// @notice A staker's total claimable DRIP right now (settled + streamed-so-far).
    function earned(address account) public view returns (uint256) {
        return (staked[account] * (rewardPerToken() - userRewardPerTokenPaid[account])) / ACC + rewards[account];
    }

    /// @dev (Re)start the stream over REWARD_DURATION, rolling in any leftover from an active stream and
    ///      any rewards that queued while nobody was staked.
    function _startStream(uint256 amount) internal {
        uint256 total = amount + queued;
        queued = 0;
        if (block.timestamp >= periodFinish) {
            rewardRate = total / REWARD_DURATION;
        } else {
            uint256 leftover = (periodFinish - block.timestamp) * rewardRate;
            rewardRate = (total + leftover) / REWARD_DURATION;
        }
        lastUpdateTime = block.timestamp;
        periodFinish = block.timestamp + REWARD_DURATION;
    }

    /// @notice Distribute `amount` DRIP (already transferred in) to stakers, streamed over the window.
    function notify(uint256 amount) external updateReward(address(0)) {
        if (totalStaked == 0) {
            queued += amount; // nobody staked yet — hold it, stream once there is stake
            emit Notified(amount);
            return;
        }
        _startStream(amount);
        emit Notified(amount);
    }

    function stake(uint256 amount) external nonReentrant updateReward(msg.sender) {
        if (amount == 0) revert ZeroAmount();
        drip.safeTransferFrom(msg.sender, address(this), amount);
        staked[msg.sender] += amount;
        totalStaked += amount;
        // If rewards were queued while the pool was empty, begin streaming them now.
        if (queued > 0) _startStream(0);
        emit Staked(msg.sender, amount);
    }

    function withdraw(uint256 amount) external nonReentrant updateReward(msg.sender) {
        if (amount == 0) revert ZeroAmount();
        if (amount > staked[msg.sender]) revert InsufficientStake();
        staked[msg.sender] -= amount;
        totalStaked -= amount;
        drip.safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    function getReward() external nonReentrant updateReward(msg.sender) returns (uint256 reward) {
        reward = rewards[msg.sender];
        if (reward > 0) {
            rewards[msg.sender] = 0;
            drip.safeTransfer(msg.sender, reward);
            emit RewardPaid(msg.sender, reward);
        }
    }
}
