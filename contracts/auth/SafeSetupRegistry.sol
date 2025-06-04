// SPDX-License-Identifier: MIT
pragma solidity =0.8.28;

import {Errors} from "../Errors.sol";
import {Multicall} from "@openzeppelin/contracts/utils/Multicall.sol";
import {ILogger} from "../interfaces/ILogger.sol";
import {IAdminVault} from "../interfaces/IAdminVault.sol";
import {ISafeSetupRegistry} from "../interfaces/ISafeSetupRegistry.sol";
import {Roles} from "./Roles.sol";

/// @title SafeSetupRegistry
/// @notice Manages Safe setup configurations with a delay mechanism
/// @notice Found a vulnerability? Please contact security@bravalabs.xyz - we appreciate responsible disclosure and reward ethical hackers
/// @author BravaLabs.xyz
contract SafeSetupRegistry is Multicall, Roles, ISafeSetupRegistry {
    /// @notice The AdminVault contract that manages permissions
    IAdminVault public immutable ADMIN_VAULT;
    
    /// @notice The Logger contract for events
    ILogger public immutable LOGGER;

    /// @notice Mapping of configuration IDs to their setup configurations
    mapping(bytes32 => SafeSetupConfig) public setupConfigs;

    /// @notice Mapping of configuration IDs to their proposal timestamps
    mapping(bytes32 => uint256) public configProposals;

    /// @notice Constructor to initialize the SafeSetupRegistry
    /// @param _adminVault The address of the AdminVault contract
    /// @param _logger The address of the Logger contract
    constructor(address _adminVault, address _logger) {
        require(
            _adminVault != address(0) && _logger != address(0), 
            Errors.InvalidInput("SafeSetupRegistry", "constructor")
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

    /// @notice Proposes a new Safe setup configuration
    /// @param _configId Unique identifier for the configuration
    /// @param _fallbackHandler Address of the fallback handler contract
    /// @param _modules Array of module addresses to enable
    /// @param _guard Address of the guard contract
    function proposeSetupConfig(
        bytes32 _configId,
        address _fallbackHandler,
        address[] calldata _modules,
        address _guard
    ) external onlyRole(Roles.TRANSACTION_PROPOSER_ROLE) {
        require(_configId != bytes32(0), Errors.InvalidInput("SafeSetupRegistry", "proposeSetupConfig"));
        require(!setupConfigs[_configId].isActive, Errors.AdminVault_TransactionAlreadyApproved());
        require(configProposals[_configId] == 0, Errors.AdminVault_AlreadyProposed());

        // Validate that at least fallback handler or guard is provided
        require(
            _fallbackHandler != address(0) || _guard != address(0),
            Errors.InvalidInput("SafeSetupRegistry", "proposeSetupConfig")
        );

        configProposals[_configId] = _getDelayTimestamp();
        
        // Store the proposed configuration temporarily (will be activated on approval)
        setupConfigs[_configId] = SafeSetupConfig({
            fallbackHandler: _fallbackHandler,
            modules: _modules,
            guard: _guard,
            isActive: false
        });

        emit SetupConfigProposed(_configId, _fallbackHandler, _modules, _guard);
        LOGGER.logAdminVaultEvent(107, abi.encode(_configId, _fallbackHandler, _modules, _guard));
    }

    /// @notice Cancels a proposed setup configuration
    /// @param _configId Unique identifier for the configuration
    function cancelSetupConfig(bytes32 _configId) external onlyRole(Roles.TRANSACTION_CANCELER_ROLE) {
        require(configProposals[_configId] != 0, Errors.AdminVault_TransactionNotProposed());

        delete configProposals[_configId];
        delete setupConfigs[_configId];

        emit SetupConfigCanceled(_configId);
        LOGGER.logAdminVaultEvent(307, abi.encode(_configId));
    }

    /// @notice Approves a proposed setup configuration
    /// @param _configId Unique identifier for the configuration
    function approveSetupConfig(bytes32 _configId) external onlyRole(Roles.TRANSACTION_EXECUTOR_ROLE) {
        require(_configId != bytes32(0), Errors.InvalidInput("SafeSetupRegistry", "approveSetupConfig"));
        require(!setupConfigs[_configId].isActive, Errors.AdminVault_TransactionAlreadyApproved());
        require(configProposals[_configId] != 0, Errors.AdminVault_TransactionNotProposed());
        require(
            block.timestamp >= configProposals[_configId],
            Errors.AdminVault_DelayNotPassed(block.timestamp, configProposals[_configId])
        );

        delete configProposals[_configId];
        setupConfigs[_configId].isActive = true;

        SafeSetupConfig memory config = setupConfigs[_configId];
        emit SetupConfigApproved(_configId, config.fallbackHandler, config.modules, config.guard);
        LOGGER.logAdminVaultEvent(207, abi.encode(_configId, config.fallbackHandler, config.modules, config.guard));
    }

    /// @notice Revokes an active setup configuration
    /// @param _configId Unique identifier for the configuration
    function revokeSetupConfig(bytes32 _configId) external onlyRole(Roles.TRANSACTION_DISPOSER_ROLE) {
        require(setupConfigs[_configId].isActive, "SafeSetupRegistry: Config not active");

        delete setupConfigs[_configId];

        emit SetupConfigRevoked(_configId);
        LOGGER.logAdminVaultEvent(407, abi.encode(_configId));
    }

    /// @notice Gets the current active setup configuration
    /// @param _configId Unique identifier for the configuration
    /// @return config The setup configuration
    function getSetupConfig(bytes32 _configId) external view returns (SafeSetupConfig memory config) {
        return setupConfigs[_configId];
    }

    /// @notice Checks if a setup configuration is active and approved
    /// @param _configId Unique identifier for the configuration
    /// @return bool True if the configuration is active, false otherwise
    function isApprovedConfig(bytes32 _configId) external view returns (bool) {
        return setupConfigs[_configId].isActive;
    }

    /// @notice Gets the proposal timestamp for a configuration
    /// @param _configId Unique identifier for the configuration
    /// @return uint256 The proposal timestamp (0 if not proposed)
    function getProposalTimestamp(bytes32 _configId) external view returns (uint256) {
        return configProposals[_configId];
    }
} 