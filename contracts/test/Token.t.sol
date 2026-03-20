// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import "../src/Token.sol";

contract RonTokenTest is Test {
    RonToken token;

    address owner = makeAddr("owner");
    address user = makeAddr("user");
    address user2 = makeAddr("user2");
    address lp = makeAddr("liquidityPool");

    function setUp() public {
        vm.prank(owner);
        token = new RonToken(owner, "Ron Token", "tRON");
    }

    // ─── Basic ERC20 ───────────────────────────────────────────────────

    function testInitialSupply() public view {
        assertEq(token.balanceOf(owner), 468_541_325 ether);
    }

    function testNameAndSymbol() public view {
        // Values are passed at deploy time — not hard-coded in the contract.
        assertEq(token.name(), "Ron Token");
        assertEq(token.symbol(), "tRON");
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

    // ─── Pre-trading gate (LP not set) ─────────────────────────────────

    function testBootingUpDefault() public view {
        assertTrue(token.bootingUp());
    }

    function testNoTradingBeforeLP() public {
        // Owner sends to user first (allowed because owner is involved)
        vm.prank(owner);
        assertTrue(token.transfer(user, 1000e18));

        // user → user2 should fail (LP not set, neither is owner)
        vm.prank(user);
        vm.expectRevert("Patience - Trading Not Started Yet!"); // forgefmt: disable-next-line
        bool _ok = token.transfer(user2, 500e18);
        (_ok); // silence unused-var; forge-lint satisfied by assignment above
    }

    function testOwnerCanTransferBeforeLP() public {
        // Owner → user
        vm.prank(owner);
        assertTrue(token.transfer(user, 5000e18));
        assertEq(token.balanceOf(user), 5000e18);

        // user → owner
        vm.prank(user);
        assertTrue(token.transfer(owner, 2000e18));
        assertEq(token.balanceOf(user), 3000e18);
    }

    // ─── Bootup whale cap ──────────────────────────────────────────────

    function testSetLiquidityPool() public {
        vm.prank(owner);
        token.setLiquidityPool(lp);
        assertEq(token.initialLiquidityPool(), lp);
    }

    function testBootupWhaleCapEnforced() public {
        // Enable trading
        vm.startPrank(owner);
        token.setLiquidityPool(lp);

        // Fund user with an amount just within the limit
        uint256 maxBalance = token.totalSupply() / token.initialLimit();
        assertTrue(token.transfer(user, maxBalance));
        vm.stopPrank();

        // Fund user2 from owner (user2 has 0)
        vm.prank(owner);
        assertTrue(token.transfer(user2, 100e18));

        // user2 → user should fail (user already at max)
        vm.prank(user2);
        vm.expectRevert("Just getting warmed up, limit of 1% of available TRESR until booting up is complete!"); // forgefmt: disable-next-line
        bool _ok2 = token.transfer(user, 1);
        (_ok2); // silence unused-var; forge-lint satisfied by assignment above
    }

    function testBootupOwnerExempt() public {
        // Owner (as sender) is exempt from the whale cap check
        // (the real TRESR logic: `from != owner()` skips the cap)
        vm.startPrank(owner);
        token.setLiquidityPool(lp);

        uint256 bigAmount = token.totalSupply() / 2;
        assertTrue(token.transfer(user2, bigAmount));
        vm.stopPrank();

        assertEq(token.balanceOf(user2), bigAmount);
    }

    function testBootupSellToLPAllowed() public {
        vm.startPrank(owner);
        token.setLiquidityPool(lp);

        // Fund user with an amount within the limit
        uint256 maxBalance = token.totalSupply() / token.initialLimit();
        assertTrue(token.transfer(user, maxBalance));
        vm.stopPrank();

        // user → LP should succeed (selling into LP during bootup)
        vm.prank(user);
        assertTrue(token.transfer(lp, 100e18));
    }

    function testBootupDisabled() public {
        vm.startPrank(owner);
        token.setLiquidityPool(lp);
        token.setBootingUp(false);

        // Fund users
        uint256 bigAmount = token.totalSupply() / 2;
        assertTrue(token.transfer(user, bigAmount));
        vm.stopPrank();

        // user → user2 with a big amount should succeed (no cap after bootup)
        vm.prank(user);
        assertTrue(token.transfer(user2, bigAmount));
    }

    // ─── ERC20Burnable ─────────────────────────────────────────────────

    function testBurn() public {
        // Enable trading so user can hold tokens
        vm.startPrank(owner);
        token.setLiquidityPool(lp);
        token.setBootingUp(false);
        assertTrue(token.transfer(user, 1000e18));
        vm.stopPrank();

        uint256 before = token.balanceOf(user);
        vm.prank(user);
        token.burn(500e18);
        assertEq(token.balanceOf(user), before - 500e18);
    }

    // ─── Renounce ownership ────────────────────────────────────────────

    function testRenounceTokenOwnership() public {
        vm.prank(owner);
        token.renounceTokenOwnership();

        // Owner should be address(0)
        assertEq(token.owner(), address(0));

        // Admin calls should now revert
        vm.prank(owner);
        vm.expectRevert();
        token.setBootingUp(false);
    }

    // ─── Legacy test (simple transfer after full setup) ────────────────

    function testTransfer() public {
        // Full setup: LP + bootup off
        vm.startPrank(owner);
        token.setLiquidityPool(lp);
        token.setBootingUp(false);
        assertTrue(token.transfer(user, 5000e18));
        vm.stopPrank();

        assertEq(token.balanceOf(user), 5000e18);
    }
}
