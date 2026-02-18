// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "forge-std/Test.sol";
import "../src/Token.sol";
import "../src/Faucet.sol";

contract TresrFaucetTest is Test {
    RonToken token;
    TresrFaucet faucet;

    address owner = makeAddr("owner");
    address user = makeAddr("user");

    function setUp() public {
        // Warp past zero so cooldown logic works (lastDripTime defaults to 0)
        vm.warp(1 days + 1);

        vm.startPrank(owner);

        token = new RonToken(owner);

        // Disable bootup restrictions so faucet drip transfers work
        token.setLiquidityPool(owner);
        token.setBootingUp(false);

        faucet = new TresrFaucet(address(token), owner);

        // Fund faucet with 100k tokens
        token.approve(address(faucet), 100_000e18);
        faucet.fund(100_000e18);

        vm.stopPrank();
    }

    function testDrip() public {
        vm.prank(user);
        faucet.drip();
        assertEq(token.balanceOf(user), 1000e18);
    }

    function testDripEmitsEvent() public {
        vm.prank(user);
        vm.expectEmit(true, false, false, true);
        emit TresrFaucet.Drip(user, 1000e18);
        faucet.drip();
    }

    function testCooldownEnforcement() public {
        vm.prank(user);
        faucet.drip();

        vm.prank(user);
        vm.expectRevert("Cooldown active");
        faucet.drip();
    }

    function testCooldownExpires() public {
        vm.prank(user);
        faucet.drip();

        vm.warp(block.timestamp + 24 hours + 1);

        vm.prank(user);
        faucet.drip();
        assertEq(token.balanceOf(user), 2000e18);
    }

    function testBalanceCapEnforcement() public {
        // Give user tokens just at the cap
        vm.prank(owner);
        assertTrue(token.transfer(user, 10_000e18));

        vm.prank(user);
        vm.expectRevert("Balance too high");
        faucet.drip();
    }

    function testEmptyFaucetReverts() public {
        // Withdraw all faucet funds
        vm.prank(owner);
        faucet.withdraw(100_000e18);

        vm.prank(user);
        vm.expectRevert("Faucet empty");
        faucet.drip();
    }

    function testFund() public {
        vm.startPrank(owner);
        token.approve(address(faucet), 5000e18);

        vm.expectEmit(true, false, false, true);
        emit TresrFaucet.Funded(owner, 5000e18);
        faucet.fund(5000e18);

        vm.stopPrank();
    }

    function testWithdrawOnlyOwner() public {
        vm.prank(user);
        vm.expectRevert();
        faucet.withdraw(1000e18);
    }

    function testOwnerWithdraw() public {
        uint256 before = token.balanceOf(owner);

        vm.prank(owner);
        faucet.withdraw(1000e18);

        assertEq(token.balanceOf(owner), before + 1000e18);
    }

    function testSetDripAmount() public {
        vm.prank(owner);
        faucet.setDripAmount(500e18);
        assertEq(faucet.dripAmount(), 500e18);

        // Verify new drip amount is used
        vm.prank(user);
        faucet.drip();
        assertEq(token.balanceOf(user), 500e18);
    }

    function testSetCooldown() public {
        vm.prank(owner);
        faucet.setCooldown(1 hours);
        assertEq(faucet.cooldown(), 1 hours);

        // Drip, then drip again after 1 hour
        vm.prank(user);
        faucet.drip();

        vm.warp(block.timestamp + 1 hours + 1);

        vm.prank(user);
        faucet.drip();
        assertEq(token.balanceOf(user), 2000e18);
    }

    function testSetDripAmountOnlyOwner() public {
        vm.prank(user);
        vm.expectRevert();
        faucet.setDripAmount(500e18);
    }

    function testSetCooldownOnlyOwner() public {
        vm.prank(user);
        vm.expectRevert();
        faucet.setCooldown(1 hours);
    }
}
