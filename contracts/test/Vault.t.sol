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

    function testPayFee() public {
        vm.startPrank(user);

        uint256 amount = 1000 * 10 ** 18;
        token.approve(address(vault), amount);

        bytes32 sessionId = keccak256("session1");

        vault.payFee(amount, sessionId);

        // Check vault balance (90% remains, 10% burned)
        uint256 vaultBal = token.balanceOf(address(vault));
        uint256 burnRate = vault.burnRate(); // 1000 = 10%
        uint256 expectedBurn = (amount * burnRate) / 10000;

        assertEq(vaultBal, amount - expectedBurn);

        vm.stopPrank();
    }

    function testClaim() public {
        // 1. User pays fee
        testPayFee();

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
        testPayFee();

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
        testPayFee();

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

    function testBackToBackClaims() public {
        // Two claims in quick succession — no cooldown
        testPayFee();

        // Fund vault with extra tokens for second claim
        vm.prank(owner);
        assert(token.transfer(address(vault), 500 * 10 ** 18));

        _signAndClaim(keccak256("session1"), 100 * 10 ** 18, 75);

        // Pay fee for a second session
        vm.startPrank(user);
        token.approve(address(vault), 1000 * 10 ** 18);
        vault.payFee(1000 * 10 ** 18, keccak256("session2"));
        vm.stopPrank();

        _signAndClaim(keccak256("session2"), 100 * 10 ** 18, 50);
    }

    function testClaimWithKeys() public {
        testPayFee();

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

    function testUpgradePreservesState() public {
        // 1. Put funds in vault
        testPayFee();
        uint256 vaultBalBefore = token.balanceOf(address(vault));
        uint256 burnRateBefore = vault.burnRate();

        // 2. Deploy new implementation and upgrade
        vm.startPrank(owner);
        TresrVault newImpl = new TresrVault();
        vault.upgradeToAndCall(address(newImpl), "");
        vm.stopPrank();

        // 3. Verify state is preserved across upgrade
        assertEq(token.balanceOf(address(vault)), vaultBalBefore, "Balance lost after upgrade");
        assertEq(vault.burnRate(), burnRateBefore, "Burn rate changed after upgrade");
        assertTrue(vault.hasRole(vault.DEFAULT_ADMIN_ROLE(), owner), "Admin role lost after upgrade");
        assertTrue(vault.hasRole(vault.ORACLE_ROLE(), oracle), "Oracle role lost after upgrade");
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
