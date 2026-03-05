// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";

/**
 * @title RonToken
 * @dev Test ERC-20 for local Anvil and Fuji testnet development.
 *      Named after Ron Jay, the hero of the TRESR game.
 *
 *      Mirrors the real TresrCoin (0x9913BA...) deployed on Avalanche C-Chain:
 *        - bootingUp anti-bot logic with 1% whale cap
 *        - initialLiquidityPool gate (no trading until LP is set)
 *        - ERC20Burnable support
 *        - renounceTokenOwnership()
 *
 *      Differences from real TRESR (intentional):
 *        - Name and symbol are passed at deploy time (not hard-coded)
 *        - Owner can mint additional supply for faucet funding
 *        - Uses OZ v5 _update() instead of OZ v4 _beforeTokenTransfer()
 */
contract RonToken is ERC20, Ownable, ERC20Burnable {
    bool public bootingUp = true;
    address public initialLiquidityPool;
    // 1% of TRESR will be put into the LP, 1% of the LP can be purchased
    uint256 public constant initialLimit = 100 * 100;

    /// @param tokenName  Full token name, e.g. "Ron Token" (anvil/testnet) or "TRESR" (mainnet).
    /// @param tokenSymbol Token ticker, e.g. "tRON" (anvil/testnet) or "TRESR" (mainnet).
    constructor(address initialOwner, string memory tokenName, string memory tokenSymbol)
        ERC20(tokenName, tokenSymbol)
        Ownable(initialOwner)
    {
        // Match real TRESR initial supply
        _mint(initialOwner, 468_541_325 ether);
    }

    /// @notice Owner-only mint for testnet/faucet funding (not in real TRESR).
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    function setBootingUp(bool state) external onlyOwner {
        bootingUp = state;
    }

    function setLiquidityPool(address liquidityPool) external onlyOwner {
        require(liquidityPool != address(0), "Zero address");
        initialLiquidityPool = liquidityPool;
    }

    /**
     * @dev OZ v5 equivalent of the real TRESR's _beforeTokenTransfer hook.
     *      Enforces:
     *        1. No trading until initialLiquidityPool is set (owner-only transfers)
     *        2. During bootup: 1% whale cap on receiving wallets
     *           (owner exempt; selling into LP allowed)
     *
     *      Thanks to $COQ! (preserved from original contract)
     */
    function _update(address from, address to, uint256 amount) internal override {
        // Skip restrictions for minting (from == address(0)) and burning (to == address(0))
        if (from != address(0) && to != address(0)) {
            // If liquidityPool is address(0) we've not yet enabled trading
            if (initialLiquidityPool == address(0)) {
                require(from == owner() || to == owner(), "Patience - Trading Not Started Yet!");
            } else if (bootingUp && from != owner() && to != initialLiquidityPool) {
                // Allow deployer (owner) to send/receive any amount and the
                // liquidityPool to receive any amount. This allows for loading
                // of the LP, and for people to sell tokens into the LP whilst
                // booting in progress.
                uint256 maxBalance = totalSupply() / initialLimit;
                require(
                    balanceOf(to) + amount <= maxBalance,
                    "Just getting warmed up, limit of 1% of available TRESR until booting up is complete!"
                );
            }
        }

        super._update(from, to, amount);
    }

    /// @notice Renounce the contract and pass ownership to address(0) to lock
    ///         the contract forever more.
    function renounceTokenOwnership() public onlyOwner {
        renounceOwnership();
    }
}
