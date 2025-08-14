// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Errors} from "../Errors.sol";
import {Multicall} from "@openzeppelin/contracts/utils/Multicall.sol";
import {ILogger} from "../interfaces/ILogger.sol";
import {IAdminVault} from "../interfaces/IAdminVault.sol";
import {ITokenRegistry} from "../interfaces/ITokenRegistry.sol";
import {Roles} from "./Roles.sol";

/// @title TokenRegistry
/// @notice Manages token approvals with a delay mechanism
/// @notice Found a vulnerability? Please contact security@bravalabs.xyz - we appreciate responsible disclosure and reward ethical hackers
/// @author BravaLabs.xyz
contract TokenRegistry is Multicall, Roles, ITokenRegistry {
    /// @notice The AdminVault contract that manages permissions
    IAdminVault public immutable ADMIN_VAULT;
    
    /// @notice The Logger contract for events
    ILogger public immutable LOGGER;

    /// @notice Mapping of token addresses to their approval status
    mapping(address => bool) public approvedTokens;

    /// @notice Mapping of token addresses to their proposal timestamps
    mapping(address => uint256) public tokenProposals;

    /// @notice Initializes the TokenRegistry
    /// @param _adminVault The address of the AdminVault contract
    /// @param _logger The address of the Logger contract
    constructor(address _adminVault, address _logger) {
        require(
            _adminVault != address(0) && _logger != address(0), 
            Errors.InvalidInput("TokenRegistry", "constructor")
        );
        ADMIN_VAULT = IAdminVault(_adminVault);
        LOGGER = ILogger(_logger);
    }

    /// @notice Modifier to check if caller has a specific role
    modifier onlyRole(bytes32 role) {
        if (!ADMIN_VAULT.hasRole(role, msg.sender)) {
            revert Errors.AdminVault_MissingRole(role, msg.sender);
        }
        _;
    }

    /// @notice Gets the delay timestamp from AdminVault
    function _getDelayTimestamp() internal returns (uint256) {
        return ADMIN_VAULT.getDelayTimestamp();
    }

    /// @notice Proposes a new token for approval
    /// @param _token The address of the token contract to propose
    function proposeToken(address _token) external onlyRole(Roles.TRANSACTION_PROPOSER_ROLE) {
        require(_token != address(0), Errors.InvalidInput("TokenRegistry", "proposeToken"));
        require(!approvedTokens[_token], Errors.AdminVault_TransactionAlreadyApproved());

        tokenProposals[_token] = _getDelayTimestamp();
        LOGGER.logAdminVaultEvent(106, abi.encode(_token));
    }

    /// @notice Cancels a token proposal
    /// @param _token The address of the token contract to cancel
    function cancelTokenProposal(address _token) external onlyRole(Roles.TRANSACTION_CANCELER_ROLE) {
        require(tokenProposals[_token] != 0, Errors.AdminVault_TransactionNotProposed());

        delete tokenProposals[_token];
        LOGGER.logAdminVaultEvent(306, abi.encode(_token));
    }

    /// @notice Approves a proposed token
    /// @param _token The address of the token contract to approve
    function approveToken(address _token) external onlyRole(Roles.TRANSACTION_EXECUTOR_ROLE) {
        require(_token != address(0), Errors.InvalidInput("TokenRegistry", "approveToken"));
        require(!approvedTokens[_token], Errors.AdminVault_TransactionAlreadyApproved());
        require(tokenProposals[_token] != 0, Errors.AdminVault_TransactionNotProposed());
        require(
            block.timestamp >= tokenProposals[_token],
            Errors.AdminVault_DelayNotPassed(block.timestamp, tokenProposals[_token])
        );

        delete tokenProposals[_token];
        approvedTokens[_token] = true;
        LOGGER.logAdminVaultEvent(206, abi.encode(_token));
    }

    /// @notice Revokes approval for a token
    /// @param _token The address of the token contract to revoke
    function revokeToken(address _token) external onlyRole(Roles.TRANSACTION_DISPOSER_ROLE) {
        require(approvedTokens[_token], Errors.TokenRegistry_TokenNotApproved());

        delete approvedTokens[_token];
        LOGGER.logAdminVaultEvent(406, abi.encode(_token));
    }

    /// @notice Checks if a token is approved
    /// @param _token The address of the token contract to check
    /// @return bool True if the token is approved, false otherwise
    function isApprovedToken(address _token) external view returns (bool) {
        return approvedTokens[_token];
    }
} 