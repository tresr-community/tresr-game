// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "forge-std/Script.sol";
import "../src/Vault.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

/**
 * @title DeployVault
 * @dev Deploys TresrVault behind an ERC1967 (UUPS) proxy.
 *
 * Environment variables:
 *   DEPLOYER_PRIVATE_KEY  — EOA hot wallet key
 *   TOKEN_ADDRESS         — $TRESR ERC-20 address
 *   ADMIN_ADDRESS         — Gnosis Safe (or EOA for testnet)
 *   ORACLE_ADDRESS        — IC canister's Ethereum address
 *   BURN_ADDRESS          — Fee burn destination (default 0xdead)
 */
contract DeployVault is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address tokenAddress = vm.envAddress("TOKEN_ADDRESS");
        address adminAddress = vm.envAddress("ADMIN_ADDRESS");
        address oracleAddress = vm.envAddress("ORACLE_ADDRESS");
        address burnAddress = vm.envOr("BURN_ADDRESS", address(0xdead));

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy implementation (logic-only, no state)
        TresrVault implementation = new TresrVault();
        console.log("Implementation deployed at:", address(implementation));

        // 2. Deploy proxy with initialize() calldata
        bytes memory initData = abi.encodeWithSelector(
            TresrVault.initialize.selector, tokenAddress, adminAddress, oracleAddress, burnAddress
        );

        ERC1967Proxy proxy = new ERC1967Proxy(address(implementation), initData);
        console.log("Proxy deployed at:", address(proxy));
        console.log("--- USE PROXY ADDRESS IN tresr.yaml ---");

        vm.stopBroadcast();
    }
}
