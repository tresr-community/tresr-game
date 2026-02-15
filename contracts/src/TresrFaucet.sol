// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title TresrFaucet
 * @dev Rate-limited faucet for TresrTestToken.
 *      Configurable drip amount and cooldown, with a balance cap
 *      to prevent hoarding.
 */
contract TresrFaucet is Ownable {
    using SafeERC20 for IERC20;

    IERC20 public immutable token;

    uint256 public dripAmount = 1000e18; // 1000 tokens per claim
    uint256 public cooldown = 24 hours; // 1 claim per 24h
    uint256 public constant MAX_DRIP_BALANCE = 10_000e18; // Don't drip if user > 10k

    mapping(address => uint256) public lastDripTime;

    event Drip(address indexed to, uint256 amount);
    event Funded(address indexed from, uint256 amount);
    event DripAmountUpdated(uint256 newAmount);
    event CooldownUpdated(uint256 newCooldown);

    constructor(address tokenAddr, address initialOwner) Ownable(initialOwner) {
        token = IERC20(tokenAddr);
    }

    function drip() external {
        // slither-disable-next-line timestamp
        require(block.timestamp >= lastDripTime[msg.sender] + cooldown, "Cooldown active");
        require(token.balanceOf(msg.sender) < MAX_DRIP_BALANCE, "Balance too high");
        require(token.balanceOf(address(this)) >= dripAmount, "Faucet empty");

        lastDripTime[msg.sender] = block.timestamp;
        token.safeTransfer(msg.sender, dripAmount);
        emit Drip(msg.sender, dripAmount);
    }

    function fund(uint256 amount) external {
        token.safeTransferFrom(msg.sender, address(this), amount);
        emit Funded(msg.sender, amount);
    }

    function withdraw(uint256 amount) external onlyOwner {
        token.safeTransfer(owner(), amount);
    }

    function setDripAmount(uint256 newAmount) external onlyOwner {
        dripAmount = newAmount;
        emit DripAmountUpdated(newAmount);
    }

    function setCooldown(uint256 newCooldown) external onlyOwner {
        cooldown = newCooldown;
        emit CooldownUpdated(newCooldown);
    }
}
