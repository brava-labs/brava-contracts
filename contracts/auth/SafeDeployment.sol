// SPDX-License-Identifier: MIT
pragma solidity =0.8.28;

import {Errors} from "../Errors.sol";
import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import {Multicall} from "@openzeppelin/contracts/utils/Multicall.sol";
import {ILogger} from "../interfaces/ILogger.sol";
import {IAdminVault} from "../interfaces/IAdminVault.sol";
import {ISafeDeployment} from "../interfaces/ISafeDeployment.sol";
import {ISafeSetupRegistry} from "../interfaces/ISafeSetupRegistry.sol";
import {ISafe} from "../interfaces/safe/ISafe.sol";
import {ISafeSetup} from "../interfaces/safe/ISafeSetup.sol";
/// @title SafeDeployment
/// @notice Deploys Safe accounts with current configuration from registry
/// @notice Found a vulnerability? Please contact security@bravalabs.xyz - we appreciate responsible disclosure and reward ethical hackers
/// @author BravaLabs.xyz
contract SafeDeployment is Initializable, Multicall, ISafeDeployment {
    /// @notice The AdminVault contract that manages permissions
    IAdminVault public adminVault;
    
    /// @notice The Logger contract for events
    ILogger public logger;

    /// @notice The Safe singleton contract
    address public safeSingleton;

    /// @notice The Safe setup contract for configuration
    ISafeSetup public safeSetup;

    /// @notice The setup registry for configuration management
    ISafeSetupRegistry public setupRegistry;

    /// @notice Default threshold for Safe transactions (1 for single owner)
    uint256 public constant DEFAULT_THRESHOLD = 1;

    /// @notice Storage gap for future upgrades
    uint256[50] private __gap;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /// @notice Initializes the SafeDeployment contract
    /// @param _adminVault The address of the AdminVault contract
    /// @param _logger The address of the Logger contract
    /// @param _safeSingleton The address of the Safe singleton
    /// @param _safeSetup The address of the Safe setup contract
    /// @param _setupRegistry The address of the setup registry
    function initialize(
        address _adminVault,
        address _logger,
        address _safeSingleton,
        address _safeSetup,
        address _setupRegistry
    ) external initializer {
        require(
            _adminVault != address(0) && 
            _logger != address(0) && 
            _safeSingleton != address(0) &&
            _safeSetup != address(0) &&
            _setupRegistry != address(0), 
            Errors.InvalidInput("SafeDeployment", "initialize")
        );
        // Ensure provided addresses point to deployed contracts where expected
        require(_adminVault.code.length > 0, Errors.InvalidInput("SafeDeployment", "adminVault"));
        require(_logger.code.length > 0, Errors.InvalidInput("SafeDeployment", "logger"));
        require(_safeSingleton.code.length > 0, Errors.InvalidInput("SafeDeployment", "safeSingleton"));
        require(_safeSetup.code.length > 0, Errors.InvalidInput("SafeDeployment", "safeSetup"));
        require(_setupRegistry.code.length > 0, Errors.InvalidInput("SafeDeployment", "setupRegistry"));
        
        adminVault = IAdminVault(_adminVault);
        logger = ILogger(_logger);
        safeSingleton = _safeSingleton;
        safeSetup = ISafeSetup(_safeSetup);
        setupRegistry = ISafeSetupRegistry(_setupRegistry);
    }



    /// @notice Deploys a Safe with the current configuration from the registry
    /// @param _userAddress The address that will own the Safe
    /// @return safeAddress The address of the deployed Safe
    function deploySafe(address _userAddress) external returns (address safeAddress) {
        require(_userAddress != address(0), Errors.InvalidInput("SafeDeployment", "deploySafe"));
        // Avoid external self-call; compute deterministically and check code size
        require(!_isContract(_predictSafeAddress(_userAddress)), Errors.SafeDeployment_SafeAlreadyDeployed());

        // Get current configuration and deploy
        ISafeSetupRegistry.SafeSetupConfig memory config = setupRegistry.getCurrentConfig();
        safeAddress = _deploySafe(_userAddress, config);
        
        emit SafeDeployed(_userAddress, safeAddress);
        logger.logAdminVaultEvent(108, abi.encode(_userAddress, safeAddress));
    }

    /// @notice Internal function for safe deployment
    /// @param _userAddress The address that will own the Safe
    /// @param _config The setup configuration
    /// @return safeAddress The address of the deployed Safe
    function _deploySafe(
        address _userAddress,
        ISafeSetupRegistry.SafeSetupConfig memory _config
    ) internal returns (address safeAddress) {
        // Prepare owners array (single owner)
        address[] memory owners = new address[](1);
        owners[0] = _userAddress;

        // Assemble setup data with all modules, fallback handler, and guard
        bytes memory setupData = "";
        address setupTarget = address(0);
        
        // Use SafeSetup.setup() to configure everything atomically if we have any configuration
        if (_config.modules.length > 0 || _config.guard != address(0) || _config.fallbackHandler != address(0)) {
            setupTarget = address(safeSetup);
            setupData = abi.encodeWithSelector(
                ISafeSetup.setup.selector,
                _config.modules,
                _config.guard,
                _config.fallbackHandler
            );
        }

        // Build Safe initializer with configuration
        bytes memory initializer = abi.encodeWithSelector(
            ISafe.setup.selector,
            owners,                         // owners array
            DEFAULT_THRESHOLD,              // threshold (1)
            setupTarget,                    // to: SafeSetup for complete configuration
            setupData,                      // data: SafeSetup.setup() call with all configs
            address(0),                     // fallbackHandler set via SafeSetup.setup() to avoid duplicate writes
            address(0),                     // paymentToken
            0,                             // payment
            address(0)                     // paymentReceiver
        );

        // Deploy Safe using CREATE2 with EIP-1167 minimal proxy pattern
        bytes memory creationCode = _getCreationCode();

        bytes32 salt = keccak256(abi.encodePacked(_userAddress));
        
        assembly {
            safeAddress := create2(0, add(creationCode, 0x20), mload(creationCode), salt)
        }
        
        require(safeAddress != address(0), Errors.SafeDeployment_SafeDeploymentFailed());
        
        // Initialize the Safe with complete configuration
        (bool success, ) = safeAddress.call(initializer);
        require(success, Errors.SafeDeployment_SafeInitializationFailed());
    }

    /// @notice Predicts the address of a Safe before deployment
    /// @param _userAddress The address that will own the Safe
    /// @return safeAddress The predicted Safe address
    function predictSafeAddress(address _userAddress) external view returns (address safeAddress) {
        require(_userAddress != address(0), Errors.InvalidInput("SafeDeployment", "predictSafeAddress"));
        safeAddress = _predictSafeAddress(_userAddress);
    }

    /// @notice Checks if a Safe is already deployed at the predicted address
    /// @param _userAddress The address that will own the Safe
    /// @return bool True if Safe is already deployed, false otherwise
    function isSafeDeployed(address _userAddress) external view returns (bool) {
        address predictedAddress = _predictSafeAddress(_userAddress);
        return _isContract(predictedAddress);
    }

    /// @notice Gets the Safe singleton address used for deployments
    /// @return address The Safe singleton address
    function getSafeSingleton() external view returns (address) {
        return safeSingleton;
    }

    /// @notice Gets the setup registry address
    /// @return address The setup registry address
    function getSetupRegistry() external view returns (address) {
        return address(setupRegistry);
    }

    /// @notice Exposes the keccak256 hash of the EIP-1167 creation code for the configured Safe singleton
    /// @return bytes32 The init code hash used for CREATE2 address derivation
    function creationCodeHash() external view returns (bytes32) {
        return keccak256(_getCreationCode());
    }

    /// @notice Computes the EIP-1167 minimal proxy creation code for the configured Safe singleton
    function _getCreationCode() internal view returns (bytes memory creationCode) {
        // EIP-1167 minimal proxy: creation + runtime code with implementation address embedded
        creationCode = abi.encodePacked(
            hex"3d602d80600a3d3981f3363d3d373d3d3d363d73",
            safeSingleton,
            hex"5af43d82803e903d91602b57fd5bf3"
        );
    }

    /// @notice Internal helper to predict Safe address for a given user
    function _predictSafeAddress(address _userAddress) internal view returns (address) {
        bytes memory creationCode = _getCreationCode();
        bytes32 salt = keccak256(abi.encodePacked(_userAddress));
        return address(uint160(uint256(keccak256(abi.encodePacked(
            bytes1(0xff),
            address(this),
            salt,
            keccak256(creationCode)
        )))));
    }

    /// @notice Checks if an address is a contract
    /// @param _address The address to check
    /// @return bool True if the address is a contract, false otherwise
    function _isContract(address _address) internal view returns (bool) {
        uint256 size;
        assembly {
            size := extcodesize(_address)
        }
        return size > 0;
    }
} 