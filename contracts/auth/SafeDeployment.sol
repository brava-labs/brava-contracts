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
    IAdminVault public ADMIN_VAULT;
    
    /// @notice The Logger contract for events
    ILogger public LOGGER;

    /// @notice The Safe singleton contract
    address public SAFE_SINGLETON;

    /// @notice The Safe setup contract for configuration
    ISafeSetup public SAFE_SETUP;

    /// @notice The setup registry for configuration management
    ISafeSetupRegistry public SETUP_REGISTRY;

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
        
        ADMIN_VAULT = IAdminVault(_adminVault);
        LOGGER = ILogger(_logger);
        SAFE_SINGLETON = _safeSingleton;
        SAFE_SETUP = ISafeSetup(_safeSetup);
        SETUP_REGISTRY = ISafeSetupRegistry(_setupRegistry);
    }



    /// @notice Deploys a Safe with the current configuration from the registry
    /// @param _userAddress The address that will own the Safe
    /// @return safeAddress The address of the deployed Safe
    function deploySafe(address _userAddress) external returns (address safeAddress) {
        require(_userAddress != address(0), Errors.InvalidInput("SafeDeployment", "deploySafe"));
        require(!this.isSafeDeployed(_userAddress), "SafeDeployment: Safe already deployed for this user");

        // Get current configuration and deploy
        ISafeSetupRegistry.SafeSetupConfig memory config = SETUP_REGISTRY.getCurrentConfig();
        safeAddress = _deploySafe(_userAddress, config);
        
        emit SafeDeployed(_userAddress, safeAddress);
        LOGGER.logAdminVaultEvent(108, abi.encode(_userAddress, safeAddress));
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
            setupTarget = address(SAFE_SETUP);
            setupData = abi.encodeWithSelector(
                ISafeSetup.setup.selector,
                _config.modules,
                _config.guard,
                _config.fallbackHandler
            );
        }

        // Build Safe initializer with all configuration
        bytes memory initializer = abi.encodeWithSelector(
            ISafe.setup.selector,
            owners,                         // owners array
            DEFAULT_THRESHOLD,              // threshold (1)
            setupTarget,                    // to: SafeSetup for complete configuration
            setupData,                      // data: SafeSetup.setup() call with all configs
            _config.fallbackHandler,        // fallbackHandler (primary configuration)
            address(0),                     // paymentToken
            0,                             // payment
            address(0)                     // paymentReceiver
        );

        // Deploy Safe using CREATE2 with EIP-1167 minimal proxy pattern
        bytes memory creationCode = abi.encodePacked(
            hex"3d602d80600a3d3981f3363d3d373d3d3d363d73",  // EIP-1167 proxy creation bytecode
            SAFE_SINGLETON,                                  // 20 bytes - implementation address
            hex"5af43d82803e903d91602b57fd5bf3"              // EIP-1167 runtime bytecode
        );

        bytes32 salt = keccak256(abi.encodePacked(_userAddress));
        
        assembly {
            safeAddress := create2(0, add(creationCode, 0x20), mload(creationCode), salt)
        }
        
        require(safeAddress != address(0), "SafeDeployment: Safe deployment failed");
        
        // Initialize the Safe with complete configuration
        (bool success, ) = safeAddress.call(initializer);
        require(success, "SafeDeployment: Safe initialization failed");
    }

    /// @notice Predicts the address of a Safe before deployment
    /// @param _userAddress The address that will own the Safe
    /// @return safeAddress The predicted Safe address
    function predictSafeAddress(address _userAddress) external view returns (address safeAddress) {
        require(_userAddress != address(0), Errors.InvalidInput("SafeDeployment", "predictSafeAddress"));

        // Calculate deterministic address using our own CREATE2 logic
        bytes memory creationCode = abi.encodePacked(
            hex"3d602d80600a3d3981f3363d3d373d3d3d363d73",
            SAFE_SINGLETON,
            hex"5af43d82803e903d91602b57fd5bf3"
        );

        bytes32 salt = keccak256(abi.encodePacked(_userAddress));
        
        safeAddress = address(uint160(uint256(keccak256(abi.encodePacked(
            bytes1(0xff),
            address(this),
            salt,
            keccak256(creationCode)
        )))));
    }

    /// @notice Checks if a Safe is already deployed at the predicted address
    /// @param _userAddress The address that will own the Safe
    /// @return bool True if Safe is already deployed, false otherwise
    function isSafeDeployed(address _userAddress) external view returns (bool) {
        address predictedAddress = this.predictSafeAddress(_userAddress);
        return _isContract(predictedAddress);
    }

    /// @notice Gets the Safe singleton address used for deployments
    /// @return address The Safe singleton address
    function getSafeSingleton() external view returns (address) {
        return SAFE_SINGLETON;
    }

    /// @notice Gets the setup registry address
    /// @return address The setup registry address
    function getSetupRegistry() external view returns (address) {
        return address(SETUP_REGISTRY);
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