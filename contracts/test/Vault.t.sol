// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "forge-std/Test.sol";
import "../src/Vault.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

// Mock Token
contract MockToken is ERC20 {
    constructor() ERC20("Tresr", "TRESR") {
        _mint(msg.sender, 1000000 * 10 ** 18);
    }
}

contract VaultTest is Test {
    TresrVault vault; // points to proxy
    TresrVault implementation;
    MockToken token;

    uint256 ownerPrivateKey = 0xA11CE;
    address owner = vm.addr(ownerPrivateKey);

    uint256 oraclePrivateKey = 0xB0B;
    address oracle = vm.addr(oraclePrivateKey);

    uint256 userPrivateKey = 0xCAFE;
    address user = vm.addr(userPrivateKey);

    address burnAddress;

    function setUp() public {
        vm.startPrank(owner);
        token = new MockToken();
        burnAddress = makeAddr("burn");

        // Deploy implementation
        implementation = new TresrVault();

        // Deploy proxy with initialize
        bytes memory initData =
            abi.encodeWithSelector(TresrVault.initialize.selector, address(token), owner, oracle, burnAddress);
        ERC1967Proxy proxy = new ERC1967Proxy(address(implementation), initData);
        vault = TresrVault(address(proxy));

        // Fund user
        assert(token.transfer(user, 10000 * 10 ** 18));
        vm.stopPrank();
    }

    function testDeposit() public {
        vm.startPrank(user);

        uint256 amount = 1000 * 10 ** 18;
        token.approve(address(vault), amount);

        bytes32 sessionId = keccak256("session1");

        vault.deposit(amount, sessionId);

        // Check vault balance (90% remains, 10% burned)
        uint256 vaultBal = token.balanceOf(address(vault));
        uint256 burnRate = vault.burnRate(); // 1000 = 10%
        uint256 expectedBurn = (amount * burnRate) / 10000;

        assertEq(vaultBal, amount - expectedBurn);

        vm.stopPrank();
    }

    function testClaim() public {
        // 1. User deposits
        testDeposit();

        // Advance time past cooldown (1 hour + 1 second)
        vm.warp(block.timestamp + 3601);

        bytes32 sessionId = keccak256("session1");
        uint256 prize = 100 * 10 ** 18; // 100 TRESR < 50% of 900 TRESR
        uint256 keys = 75;

        // 2. Oracle signs claim
        bytes32 messageHash = keccak256(abi.encodePacked(sessionId, user, prize, keys));
        bytes32 ethSignedMessageHash = MessageHashUtils.toEthSignedMessageHash(messageHash);

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(oraclePrivateKey, ethSignedMessageHash);
        bytes memory signature = abi.encodePacked(r, s, v);

        // 3. User claims
        vm.startPrank(user);

        uint256 balBefore = token.balanceOf(user);
        vault.claim(sessionId, prize, keys, signature);
        uint256 balAfter = token.balanceOf(user);

        assertEq(balAfter - balBefore, prize);

        vm.stopPrank();
    }

    function testClaimMinAmount() public {
        testDeposit();
        vm.warp(block.timestamp + 3601);

        bytes32 sessionId = keccak256("session1");
        uint256 prize = 40 * 10 ** 18; // 40 TRESR < 50 TRESR
        uint256 keys = 75;

        bytes32 messageHash = keccak256(abi.encodePacked(sessionId, user, prize, keys));
        bytes32 ethSignedMessageHash = MessageHashUtils.toEthSignedMessageHash(messageHash);

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(oraclePrivateKey, ethSignedMessageHash);
        bytes memory signature = abi.encodePacked(r, s, v);

        vm.startPrank(user);
        vm.expectRevert("Min claim 50 TRESR");
        vault.claim(sessionId, prize, keys, signature);
        vm.stopPrank();
    }

    function testClaimCap() public {
        testDeposit();
        vm.warp(block.timestamp + 3601);

        bytes32 sessionId = keccak256("session1");
        uint256 vaultBal = token.balanceOf(address(vault));
        uint256 prize = vaultBal / 2 + 1; // >50%
        uint256 keys = 150;

        bytes32 messageHash = keccak256(abi.encodePacked(sessionId, user, prize, keys));
        bytes32 ethSignedMessageHash = MessageHashUtils.toEthSignedMessageHash(messageHash);

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(oraclePrivateKey, ethSignedMessageHash);
        bytes memory signature = abi.encodePacked(r, s, v);

        vm.startPrank(user);
        vm.expectRevert("Max 50% of vault");
        vault.claim(sessionId, prize, keys, signature);
        vm.stopPrank();
    }

    function testClaimCooldown() public {
        testClaim(); // First claim succeeds

        // Try second claim immediately (should fail — cooldown is 1 hour)
        bytes32 sessionId2 = keccak256("session2");
        uint256 prize = 100 * 10 ** 18;
        uint256 keys = 50;

        bytes32 messageHash = keccak256(abi.encodePacked(sessionId2, user, prize, keys));
        bytes32 ethSignedMessageHash = MessageHashUtils.toEthSignedMessageHash(messageHash);

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(oraclePrivateKey, ethSignedMessageHash);
        bytes memory signature = abi.encodePacked(r, s, v);

        vm.startPrank(user);
        vm.expectRevert("Claim cooldown active");
        vault.claim(sessionId2, prize, keys, signature);
        vm.stopPrank();
    }

    function testClaimWithKeys() public {
        testDeposit();
        vm.warp(block.timestamp + 3601);

        bytes32 sessionId = keccak256("session1");
        uint256 prize = 100 * 10 ** 18;
        uint256 keys = 150; // Full keys

        bytes32 messageHash = keccak256(abi.encodePacked(sessionId, user, prize, keys));
        bytes32 ethSignedMessageHash = MessageHashUtils.toEthSignedMessageHash(messageHash);

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(oraclePrivateKey, ethSignedMessageHash);
        bytes memory signature = abi.encodePacked(r, s, v);

        vm.startPrank(user);
        vault.claim(sessionId, prize, keys, signature);
        vm.stopPrank();
    }

    function testCannotReinitialize() public {
        vm.expectRevert(Initializable.InvalidInitialization.selector);
        vault.initialize(address(token), owner, oracle, burnAddress);
    }

    function testOnlyAdminCanUpgrade() public {
        TresrVault newImpl = new TresrVault();

        // Non-admin cannot upgrade
        vm.prank(user);
        vm.expectRevert();
        vault.upgradeToAndCall(address(newImpl), "");

        // Admin can upgrade
        vm.prank(owner);
        vault.upgradeToAndCall(address(newImpl), "");
    }

    function testSetClaimCooldown() public {
        vm.prank(owner);
        vault.setClaimCooldown(7200); // 2 hours
        assertEq(vault.claimCooldown(), 7200);
    }

    function testClaimCooldownUsesVariable() public {
        // Set cooldown to 30 minutes
        vm.prank(owner);
        vault.setClaimCooldown(1800);

        // First claim
        testDeposit();
        vm.warp(block.timestamp + 1801);
        _signAndClaim(keccak256("session1"), 100 * 10 ** 18, 75);

        // Second claim after 30 minutes should work
        vm.warp(block.timestamp + 1801);
        _signAndClaim(keccak256("session2"), 100 * 10 ** 18, 75);
    }

    // --- Helpers ---

    /// @dev Sign a claim with the oracle key and execute it as the user
    function _signAndClaim(bytes32 sessionId, uint256 prize, uint256 keys) internal {
        bytes32 hash = keccak256(abi.encodePacked(sessionId, user, prize, keys));
        bytes32 ethHash = MessageHashUtils.toEthSignedMessageHash(hash);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(oraclePrivateKey, ethHash);
        vm.prank(user);
        vault.claim(sessionId, prize, keys, abi.encodePacked(r, s, v));
    }
}
