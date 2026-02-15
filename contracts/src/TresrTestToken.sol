// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title TresrTestToken
 * @dev Mock ERC-20 for local Anvil and Fuji testnet development.
 *      No transfer restrictions (unlike real tTRESR bootup caps).
 *      Owner can mint additional supply for faucet funding.
 */
contract TresrTestToken is ERC20, Ownable {
    constructor(address initialOwner) ERC20("TRESR Test Token", "tTRESRDev") Ownable(initialOwner) {
        // Mint 1B tokens to deployer (matches real tTRESR total supply)
        _mint(initialOwner, 1_000_000_000 * 10 ** 18);
    }

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}
