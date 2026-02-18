// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "forge-std/Script.sol";
import "../src/Token.sol";
import "../src/Faucet.sol";

/**
 * @title DeployTestToken
 * @dev Deploys RonToken + TresrFaucet, configures bootup, and funds the faucet.
 *
 * Environment variables:
 *   DEPLOYER_PRIVATE_KEY  — EOA hot wallet key
 *   FAUCET_FUND_AMOUNT    — Tokens to seed faucet (default 100k)
 */
contract DeployTestToken is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        uint256 faucetFundAmount = vm.envOr("FAUCET_FUND_AMOUNT", uint256(100_000e18));

        vm.startBroadcast(deployerKey);

        // 1. Deploy token (mints 468M to deployer)
        RonToken token = new RonToken(deployer);
        console.log("RonToken deployed at:", address(token));

        // 2. Configure bootup — set deployer as LP and disable bootup
        //    so testnet operates without transfer restrictions
        token.setLiquidityPool(deployer);
        token.setBootingUp(false);
        console.log("Bootup configured: LP set to deployer, bootingUp disabled");

        // 3. Deploy faucet
        TresrFaucet faucet = new TresrFaucet(address(token), deployer);
        console.log("TresrFaucet deployed at:", address(faucet));

        // 4. Fund faucet (100k tokens by default)
        token.approve(address(faucet), faucetFundAmount);
        faucet.fund(faucetFundAmount);
        console.log("Faucet funded with:", faucetFundAmount);

        vm.stopBroadcast();
    }
}
