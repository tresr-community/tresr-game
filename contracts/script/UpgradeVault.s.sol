// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Script.sol";
import "../src/Vault.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/**
 * @title UpgradeVault
 * @dev Deploys a new TresrVault implementation and outputs the calldata
 *      needed to upgrade the existing UUPS proxy via a Gnosis Safe.
 *
 *      The deployer EOA broadcasts the new implementation deployment, but
 *      the upgrade itself must be executed by the multisig (DEFAULT_ADMIN_ROLE).
 *
 * Environment variables:
 *   DEPLOYER_PRIVATE_KEY  — EOA hot wallet key (deploys new impl)
 *   VAULT_PROXY_ADDRESS   — Existing ERC1967 proxy address
 */
contract UpgradeVault is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address proxyAddress = vm.envAddress("VAULT_PROXY_ADDRESS");

        // 1. Deploy new implementation contract
        vm.startBroadcast(deployerKey);
        TresrVault newImpl = new TresrVault();
        vm.stopBroadcast();

        // 2. Output upgrade details for multisig submission
        bytes memory upgradeCalldata = abi.encodeCall(UUPSUpgradeable.upgradeToAndCall, (address(newImpl), ""));

        console.log("========================================");
        console.log("  VAULT UPGRADE -- MULTISIG ACTION REQUIRED");
        console.log("========================================");
        console.log("");
        console.log("New implementation:", address(newImpl));
        console.log("Proxy (target):", proxyAddress);
        console.log("");
        console.log("Submit this transaction to your Gnosis Safe:");
        console.log("  To:", proxyAddress);
        console.log("  Value: 0");
        console.log("  Data:");
        console.logBytes(upgradeCalldata);
        console.log("");
        console.log("========================================");
    }
}
