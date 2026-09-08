// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title DripMineToken ($DRIP)
/// @notice The game token for the ORE-style Grid Mine (docs/GRID-MINE.md). Fixed hard cap; the ONLY
///         minter is the GridMine contract (set once, then locked). No team allocation.
/// @dev v1 uses the ORE "mint per round" model. If instead you want a fixed-supply, Pons-launched
///      DRIP (SPEC §1), pre-mint the cap to a locked EmissionsReserve and have GridMine pay from it
///      rather than mint (DECISIONS #6/#8). This contract is for the mint-model variant.
contract DripMineToken is ERC20, ERC20Burnable, Ownable {
    uint256 public immutable cap;
    address public minter;
    bool public minterLocked;

    event MinterSet(address indexed minter);
    event MinterLocked();

    error CapExceeded();
    error NotMinter();
    error MinterAlreadyLocked();
    error ZeroAddress();

    constructor(uint256 cap_, address owner_) ERC20("Drip", "DRIP") Ownable(owner_) {
        if (cap_ == 0) revert CapExceeded();
        cap = cap_;
    }

    /// @notice Set the GridMine minter. Owner-only, and only until locked.
    function setMinter(address minter_) external onlyOwner {
        if (minterLocked) revert MinterAlreadyLocked();
        if (minter_ == address(0)) revert ZeroAddress();
        minter = minter_;
        emit MinterSet(minter_);
    }

    /// @notice Permanently lock the minter (fair-launch credibility: no swapping the minter later).
    function lockMinter() external onlyOwner {
        if (minter == address(0)) revert ZeroAddress();
        minterLocked = true;
        emit MinterLocked();
    }

    /// @notice Mint game emissions. Only the GridMine minter, never past the cap.
    function mint(address to, uint256 amount) external {
        if (msg.sender != minter) revert NotMinter();
        if (totalSupply() + amount > cap) revert CapExceeded();
        _mint(to, amount);
    }
}
