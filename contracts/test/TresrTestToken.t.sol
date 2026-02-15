// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "forge-std/Test.sol";
import "../src/TresrTestToken.sol";

contract TresrTestTokenTest is Test {
    TresrTestToken token;

    address owner = makeAddr("owner");
    address user = makeAddr("user");

    function setUp() public {
        vm.prank(owner);
        token = new TresrTestToken(owner);
    }

    function testInitialSupply() public view {
        assertEq(token.balanceOf(owner), 1_000_000_000 * 10 ** 18);
    }

    function testNameAndSymbol() public view {
        assertEq(token.name(), "TRESR Test Token");
        assertEq(token.symbol(), "tTRESRDev");
    }

    function testDecimals() public view {
        assertEq(token.decimals(), 18);
    }

    function testOwnerCanMint() public {
        vm.prank(owner);
        token.mint(user, 1000e18);
        assertEq(token.balanceOf(user), 1000e18);
    }

    function testNonOwnerCannotMint() public {
        vm.prank(user);
        vm.expectRevert();
        token.mint(user, 1000e18);
    }

    function testTransfer() public {
        vm.prank(owner);
        assertTrue(token.transfer(user, 5000e18));
        assertEq(token.balanceOf(user), 5000e18);
    }
}
