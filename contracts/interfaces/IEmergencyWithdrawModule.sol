// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.28;

/// @title IEmergencyWithdrawModule
/// @notice Interface for a Safe module that provides guaranteed withdrawals to owner addresses,
///         independent of AdminVault action registration. Designed as a last-resort escape hatch
///         when the normal bundle execution path is unavailable.
/// @notice Found a vulnerability? Please contact security@brava.finance - we appreciate responsible disclosure and reward ethical hackers
interface IEmergencyWithdrawModule {
    /// @notice Emitted when an ERC20 token is withdrawn via the emergency module
    /// @param safe The Safe from which tokens were withdrawn
    /// @param token The ERC20 token address
    /// @param to The recipient (must be a Safe owner)
    /// @param amount The amount transferred
    event EmergencyERC20Withdrawal(address indexed safe, address indexed token, address indexed to, uint256 amount);

    /// @notice Emitted when ETH is withdrawn via the emergency module
    /// @param safe The Safe from which ETH was withdrawn
    /// @param to The recipient (must be a Safe owner)
    /// @param amount The amount transferred
    event EmergencyETHWithdrawal(address indexed safe, address indexed to, uint256 amount);

    /// @notice Withdraws ERC20 tokens from a Safe to an owner address
    /// @dev Caller must be a Safe owner. Recipient must be a Safe owner.
    ///      Use `amount = type(uint256).max` to withdraw the full balance.
    /// @param safe The Safe to withdraw from (module must be enabled on this Safe)
    /// @param token The ERC20 token to withdraw
    /// @param to The recipient address (must pass `isOwner` on the Safe)
    /// @param amount The amount to withdraw, or `type(uint256).max` for full balance
    function withdrawERC20(address safe, address token, address to, uint256 amount) external;

    /// @notice Withdraws ETH from a Safe to an owner address
    /// @dev Caller must be a Safe owner. Recipient must be a Safe owner.
    ///      Use `amount = type(uint256).max` to withdraw the full ETH balance.
    /// @param safe The Safe to withdraw from (module must be enabled on this Safe)
    /// @param to The recipient address (must pass `isOwner` on the Safe)
    /// @param amount The amount to withdraw, or `type(uint256).max` for full balance
    function withdrawETH(address safe, address to, uint256 amount) external;
}
