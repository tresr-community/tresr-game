// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

/*
 * TresrVault — UUPS Upgradeable Proxy Pattern
 *
 * Uses OpenZeppelin Upgradeable contracts for proxy-safe storage and init.
 * Admin operations guarded by AccessControl roles.
 *
 * Requires:
 *   forge install OpenZeppelin/openzeppelin-contracts@v5.5.0
 *   forge install OpenZeppelin/openzeppelin-contracts-upgradeable@v5.5.0
 */

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/**
 * @title TresrVault
 * @dev Holds the $TRESR liquidity pool (UUPS upgradeable).
 *      - Users deposit to play (with a burn fee).
 *      - Users claim rewards with a signature from the IC canister oracle.
 *
 * @custom:oz-upgrades-from TresrVault
 */
contract TresrVault is Initializable, AccessControlUpgradeable, ReentrancyGuard, UUPSUpgradeable {
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    // --- Storage (no immutable — proxy pattern uses storage slots) ---
    IERC20 public token;
    address public burnAddress;

    // Config
    uint256 public burnRate; // Basis points: 10000 = 100%
    uint256 public claimCooldown; // seconds

    // State
    mapping(bytes32 => bool) public depositedSessions; // sessionId -> deposited
    mapping(bytes32 => bool) public claimedSessions; // sessionId -> claimed
    mapping(address => uint256) public lastClaimTime; // user -> last claim timestamp

    // Events
    event Deposit(bytes32 indexed sessionId, address indexed user, uint256 amount, uint256 burned, uint256 poolAmount);
    event Claim(bytes32 indexed sessionId, address indexed user, uint256 amount);
    event BurnRateUpdated(uint256 newRate);
    event ClaimCooldownUpdated(uint256 newCooldown);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initialize the vault (replaces constructor for proxy pattern).
     * @param tokenAddr The ERC-20 token address ($TRESR).
     * @param admin The admin address (Gnosis Safe or EOA).
     * @param oracle The oracle address (IC canister's Ethereum address).
     * @param burnAddr The burn address for deposit fees.
     */
    function initialize(address tokenAddr, address admin, address oracle, address burnAddr) public initializer {
        require(tokenAddr != address(0), "Token cannot be zero");
        require(admin != address(0), "Admin cannot be zero");
        require(oracle != address(0), "Oracle cannot be zero");
        require(burnAddr != address(0), "Burn address cannot be zero");

        __AccessControl_init();
        // ReentrancyGuard & UUPSUpgradeable are @custom:stateless in v5.5.0 — no init needed

        token = IERC20(tokenAddr);
        burnAddress = burnAddr;
        burnRate = 1000; // 10.00%
        claimCooldown = 3600; // 1 hour

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);
        _grantRole(ORACLE_ROLE, oracle);
    }

    // --- Core ---

    /**
     * @notice Deposit funds to start a game session.
     * @param amount The amount of tokens to deposit.
     * @param sessionId The unique session ID (hash from frontend).
     */
    function deposit(uint256 amount, bytes32 sessionId) external nonReentrant {
        require(!depositedSessions[sessionId], "Session already deposited");
        require(amount > 0, "Amount must be > 0");

        // Transfer from user
        token.safeTransferFrom(msg.sender, address(this), amount);

        // Calculate burn
        uint256 burnAmount = (amount * burnRate) / 10000;
        uint256 poolAmount = amount - burnAmount;

        if (burnAmount > 0) {
            token.safeTransfer(burnAddress, burnAmount);
        }

        depositedSessions[sessionId] = true;

        emit Deposit(sessionId, msg.sender, amount, burnAmount, poolAmount);
    }

    /**
     * @notice Claim rewards for a winning session.
     * @param sessionId The unique session ID.
     * @param amount The reward amount.
     * @param keys The number of keys collected (for verification).
     * @param signature The signature from the Oracle authorizing this claim.
     */
    function claim(bytes32 sessionId, uint256 amount, uint256 keys, bytes calldata signature) external nonReentrant {
        require(!claimedSessions[sessionId], "Session already claimed");
        require(amount >= 5e19, "Min claim 50 TRESR");
        require(amount <= (token.balanceOf(address(this)) * 5000) / 10000, "Max 50% of vault");
        // slither-disable-next-line timestamp
        require(block.timestamp >= lastClaimTime[msg.sender] + claimCooldown, "Claim cooldown active");

        // Verify Signature
        bytes32 hash = keccak256(abi.encodePacked(sessionId, msg.sender, amount, keys));
        bytes32 ethSignedHash = hash.toEthSignedMessageHash();

        address signer = ethSignedHash.recover(signature);
        require(hasRole(ORACLE_ROLE, signer), "Invalid signature");

        claimedSessions[sessionId] = true;
        lastClaimTime[msg.sender] = block.timestamp;

        token.safeTransfer(msg.sender, amount);

        emit Claim(sessionId, msg.sender, amount);
    }

    // --- Admin ---

    function setBurnRate(uint256 newBurnRate) external onlyRole(ADMIN_ROLE) {
        require(newBurnRate <= 2000, "Max burn rate 20%");
        burnRate = newBurnRate;
        emit BurnRateUpdated(newBurnRate);
    }

    function setClaimCooldown(uint256 newCooldown) external onlyRole(ADMIN_ROLE) {
        claimCooldown = newCooldown;
        emit ClaimCooldownUpdated(newCooldown);
    }

    /**
     * @notice Emergency sweep or house edge withdrawal.
     * @dev In production, this should be called through a TimelockController.
     */
    function sweep(address to, uint256 amount) external onlyRole(ADMIN_ROLE) {
        token.safeTransfer(to, amount);
    }

    // --- UUPS ---

    /**
     * @notice Only DEFAULT_ADMIN_ROLE can authorize upgrades.
     */
    function _authorizeUpgrade(address newImplementation) internal override onlyRole(DEFAULT_ADMIN_ROLE) {}
}
