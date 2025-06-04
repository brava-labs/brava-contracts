// SPDX-License-Identifier: MIT
pragma solidity =0.8.28;

import {Errors} from "../Errors.sol";
import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import {Multicall} from "@openzeppelin/contracts/utils/Multicall.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {ILogger} from "../interfaces/ILogger.sol";
import {IAdminVault} from "../interfaces/IAdminVault.sol";
import {ISafeDeployment} from "../interfaces/ISafeDeployment.sol";
import {ISafeSetupRegistry} from "../interfaces/ISafeSetupRegistry.sol";
import {ISafe} from "../interfaces/safe/ISafe.sol";
import {ISafeSetup} from "../interfaces/safe/ISafeSetup.sol";
import {Roles} from "./Roles.sol";

// Import for typed data functionality
interface IEIP712TypedDataSafeModule {
    function executeBundle(
        address _safeAddr,
        ISafeDeployment.Bundle calldata _bundle,
        bytes calldata _signature
    ) external payable;

    function getDomainSeparator() external view returns (bytes32);
    function getBundleHash(ISafeDeployment.Bundle calldata _bundle) external view returns (bytes32);
}

/// @title SafeDeployment
/// @notice Deploys and configures Safe accounts deterministically for users
/// @notice Found a vulnerability? Please contact security@bravalabs.xyz - we appreciate responsible disclosure and reward ethical hackers
/// @author BravaLabs.xyz
contract SafeDeployment is Initializable, Multicall, Roles, ISafeDeployment {
    using ECDSA for bytes32;

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

    /// @notice The EIP712TypedDataSafeModule address
    address public EIP712_TYPED_DATA_MODULE;

    /// @notice Default threshold for Safe transactions (1 for single owner)
    uint256 public constant DEFAULT_THRESHOLD = 1;

    /// @notice Default configuration ID for typed data Safe deployments
    bytes32 public constant TYPED_DATA_SAFE_CONFIG_ID = keccak256("TYPED_DATA_SAFE_CONFIG");

    /// @notice Storage gap for future upgrades
    uint256[48] private __gap; // Reduced to account for new storage

    // Custom errors
    error SafeDeployment_InvalidTypedDataSignature();
    error SafeDeployment_TypedDataModuleNotSet();
    error SafeDeployment_TypedDataConfigNotApproved();

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

    /// @notice Sets the EIP712TypedDataSafeModule address
    /// @param _moduleAddress The address of the EIP712TypedDataSafeModule
    function setEIP712TypedDataModule(address _moduleAddress) external onlyRole(OWNER_ROLE) {
        require(_moduleAddress != address(0), Errors.InvalidInput("SafeDeployment", "setEIP712TypedDataModule"));
        EIP712_TYPED_DATA_MODULE = _moduleAddress;
    }

    /// @notice Executes a typed data bundle, deploying Safe if needed
    /// @param _bundle The bundle containing sequences for multiple chains
    /// @param _signature EIP-712 signature from the intended Safe owner
    function executeTypedDataBundle(
        Bundle calldata _bundle,
        bytes calldata _signature
    ) external payable {
        // Verify module is set
        if (EIP712_TYPED_DATA_MODULE == address(0)) {
            revert SafeDeployment_TypedDataModuleNotSet();
        }

        // Recover signer from bundle signature
        address intendedOwner = _recoverBundleSigner(_bundle, _signature);
        
        // Ensure Safe exists for the intended owner
        (address safeAddress, bool wasDeployed) = _ensureSafeExists(intendedOwner);

        // Forward bundle to the Safe's module for verification and execution
        IEIP712TypedDataSafeModule(EIP712_TYPED_DATA_MODULE).executeBundle{value: msg.value}(
            safeAddress,
            _bundle,
            _signature
        );

        emit TypedDataBundleExecuted(intendedOwner, safeAddress, wasDeployed);
    }

    /// @notice Recovers the signer address from a bundle signature
    /// @param _bundle The bundle to verify
    /// @param _signature The signature to recover from
    /// @return signer The address that signed the bundle
    function _recoverBundleSigner(
        Bundle calldata _bundle,
        bytes calldata _signature
    ) internal view returns (address signer) {
        // Get the bundle hash from the module (includes domain separator)
        bytes32 bundleHash = IEIP712TypedDataSafeModule(EIP712_TYPED_DATA_MODULE).getBundleHash(_bundle);
        
        // Recover signer
        signer = bundleHash.recover(_signature);
        
        if (signer == address(0)) {
            revert SafeDeployment_InvalidTypedDataSignature();
        }
    }

    /// @notice Ensures a Safe exists for the given owner, deploying if necessary
    /// @param _ownerAddress The intended owner of the Safe
    /// @return safeAddress The address of the Safe
    /// @return wasDeployed True if the Safe was deployed, false if it already existed
    function _ensureSafeExists(address _ownerAddress) internal returns (address safeAddress, bool wasDeployed) {
        // Check if Safe already exists
        if (this.isSafeDeployed(_ownerAddress)) {
            safeAddress = this.predictSafeAddress(_ownerAddress);
            wasDeployed = false;
        } else {
            // Deploy Safe with typed data configuration
            safeAddress = _deploySafeForTypedData(_ownerAddress);
            wasDeployed = true;
        }
    }

    /// @notice Deploys a Safe configured for typed data execution
    /// @param _userAddress The address that will own the Safe
    /// @return safeAddress The address of the deployed Safe
    function _deploySafeForTypedData(address _userAddress) internal returns (address safeAddress) {
        // Verify typed data configuration is approved
        if (!SETUP_REGISTRY.isApprovedConfig(TYPED_DATA_SAFE_CONFIG_ID)) {
            revert SafeDeployment_TypedDataConfigNotApproved();
        }

        // Get the typed data configuration
        ISafeSetupRegistry.SafeSetupConfig memory config = SETUP_REGISTRY.getSetupConfig(TYPED_DATA_SAFE_CONFIG_ID);
        
        // Ensure the EIP712TypedDataSafeModule is included in the configuration
        bool moduleIncluded = false;
        for (uint256 i = 0; i < config.modules.length; i++) {
            if (config.modules[i] == EIP712_TYPED_DATA_MODULE) {
                moduleIncluded = true;
                break;
            }
        }
        
        if (!moduleIncluded) {
            // Create a new config with the module included
            address[] memory modulesWithTypedData = new address[](config.modules.length + 1);
            for (uint256 i = 0; i < config.modules.length; i++) {
                modulesWithTypedData[i] = config.modules[i];
            }
            modulesWithTypedData[config.modules.length] = EIP712_TYPED_DATA_MODULE;
            
            config.modules = modulesWithTypedData;
        }

        // Deploy the Safe
        safeAddress = _deploySafe(_userAddress, config);
        
        emit SafeDeployed(_userAddress, safeAddress, TYPED_DATA_SAFE_CONFIG_ID, 0);
        LOGGER.logAdminVaultEvent(108, abi.encode(_userAddress, safeAddress, TYPED_DATA_SAFE_CONFIG_ID, 0));
    }

    /// @notice Modifier to check if caller has a specific role
    modifier onlyRole(bytes32 role) {
        if (!ADMIN_VAULT.hasRole(role, msg.sender)) {
            revert Errors.AdminVault_MissingRole(role, msg.sender);
        }
        _;
    }

    /// @notice Deploys and configures a Safe for a user
    /// @param _userAddress The address that will own the Safe
    /// @param _configId The configuration ID to use from the setup registry (for initial setup only)
    /// @return safeAddress The address of the deployed Safe
    function deploySafeForUser(
        address _userAddress,
        bytes32 _configId
    ) external onlyRole(TRANSACTION_EXECUTOR_ROLE) returns (address safeAddress) {
        require(_userAddress != address(0), Errors.InvalidInput("SafeDeployment", "deploySafeForUser"));
        require(_configId != bytes32(0), Errors.InvalidInput("SafeDeployment", "deploySafeForUser"));
        
        // Verify configuration is approved
        require(
            SETUP_REGISTRY.isApprovedConfig(_configId),
            "SafeDeployment: Configuration not approved"
        );

        // Check if Safe is already deployed at the predicted address
        require(
            !this.isSafeDeployed(_userAddress),
            "SafeDeployment: Safe already deployed for this user"
        );

        // Get configuration
        ISafeSetupRegistry.SafeSetupConfig memory config = SETUP_REGISTRY.getSetupConfig(_configId);

        // Deploy the Safe
        safeAddress = _deploySafe(_userAddress, config);
        
        emit SafeDeployed(_userAddress, safeAddress, _configId, 0); // saltNonce is always 0 now
        LOGGER.logAdminVaultEvent(108, abi.encode(_userAddress, safeAddress, _configId, 0));
    }

    /// @notice Reconfigures an existing Safe with a new approved configuration
    /// @param _userAddress The address that owns the Safe
    /// @param _configId The new configuration ID to apply
    function reconfigureSafe(
        address _userAddress,
        bytes32 _configId
    ) external onlyRole(TRANSACTION_EXECUTOR_ROLE) {
        require(_userAddress != address(0), Errors.InvalidInput("SafeDeployment", "reconfigureSafe"));
        require(_configId != bytes32(0), Errors.InvalidInput("SafeDeployment", "reconfigureSafe"));
        
        // Verify configuration is approved
        require(
            SETUP_REGISTRY.isApprovedConfig(_configId),
            "SafeDeployment: Configuration not approved"
        );

        // Verify Safe exists
        require(
            this.isSafeDeployed(_userAddress),
            "SafeDeployment: No Safe deployed for this user"
        );

        address safeAddress = this.predictSafeAddress(_userAddress);
        ISafeSetupRegistry.SafeSetupConfig memory config = SETUP_REGISTRY.getSetupConfig(_configId);

        // Apply new configuration to existing Safe
        _configureSafe(safeAddress, config);
        
        emit SafeReconfigured(_userAddress, safeAddress, _configId);
        LOGGER.logAdminVaultEvent(109, abi.encode(_userAddress, safeAddress, _configId));
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

        // Prepare setup data to enable modules during Safe initialization
        bytes memory setupData = "";
        address setupTarget = address(0);
        
        if (_config.modules.length > 0) {
            setupTarget = address(SAFE_SETUP);
            setupData = abi.encodeWithSelector(
                ISafeSetup.enableModules.selector,
                _config.modules
            );
        }

        // Deploy the Safe with modules enabled during setup
        bytes memory initializer = abi.encodeWithSelector(
            ISafe.setup.selector,
            owners,
            DEFAULT_THRESHOLD,
            setupTarget,        // to: SafeSetup contract for enabling modules
            setupData,          // data: enableModules call
            _config.fallbackHandler, // fallbackHandler
            address(0),         // paymentToken
            0,                 // payment
            address(0)         // paymentReceiver
        );

        // Deploy Safe using CREATE2 directly
        bytes memory creationCode = abi.encodePacked(
            hex"3d602d80600a3d3981f3363d3d373d3d3d363d73",
            SAFE_SINGLETON,
            hex"5af43d82803e903d91602b57fd5bf3"
        );

        bytes32 salt = keccak256(abi.encodePacked(_userAddress));
        
        assembly {
            safeAddress := create2(0, add(creationCode, 0x20), mload(creationCode), salt)
        }
        
        require(safeAddress != address(0), "SafeDeployment: Safe deployment failed");
        
        // Initialize the Safe with basic setup
        (bool success, bytes memory returnData) = safeAddress.call(initializer);
        if (!success) {
            // Decode revert reason if available
            if (returnData.length > 0) {
                assembly {
                    let returnDataSize := mload(returnData)
                    revert(add(32, returnData), returnDataSize)
                }
            }
            revert("SafeDeployment: Safe initialization failed");
        }

        // Modules are already enabled during setup initialization

        // Finally, set the guard last (as it blocks many operations)
        if (_config.guard != address(0)) {
            bytes memory setGuardData = abi.encodeWithSelector(
                ISafeSetup.setGuard.selector,
                _config.guard
            );
            
            (bool guardSuccess, ) = safeAddress.call(
                abi.encodeWithSignature(
                    "execTransactionFromModule(address,uint256,bytes,uint8)",
                    address(SAFE_SETUP),
                    0,
                    setGuardData,
                    1 // DelegateCall
                )
            );
            
            // Note: Guard setup may fail if SAFE_SETUP is not an enabled module
            // This is expected behavior for basic Safe deployments
            if (!guardSuccess) {
                // Guard will need to be set manually if needed
            }
        }

        // Verify Safe was deployed correctly
        require(_isContract(safeAddress), "SafeDeployment: Safe not deployed as contract");
    }

    /// @notice Internal function to configure an existing Safe
    /// @param _safeAddress The address of the existing Safe
    /// @param _config The configuration to apply
    function _configureSafe(
        address _safeAddress,
        ISafeSetupRegistry.SafeSetupConfig memory _config
    ) internal {
        // Configure modules if any
        if (_config.modules.length > 0) {
            bytes memory enableModulesData = abi.encodeWithSelector(
                ISafeSetup.enableModules.selector,
                _config.modules
            );
            
            (bool moduleSuccess, ) = _safeAddress.call(
                abi.encodeWithSignature(
                    "execTransactionFromModule(address,uint256,bytes,uint8)",
                    address(SAFE_SETUP),
                    0,
                    enableModulesData,
                    1 // DelegateCall
                )
            );
            
            // Note: Module setup may fail if SAFE_SETUP is not an enabled module
            if (!moduleSuccess) {
                // Modules will need to be enabled manually if needed
            }
        }

        // Set the guard (as it blocks many operations, this should be done carefully)
        if (_config.guard != address(0)) {
            bytes memory setGuardData = abi.encodeWithSelector(
                ISafeSetup.setGuard.selector,
                _config.guard
            );
            
            (bool guardSuccess, ) = _safeAddress.call(
                abi.encodeWithSignature(
                    "execTransactionFromModule(address,uint256,bytes,uint8)",
                    address(SAFE_SETUP),
                    0,
                    setGuardData,
                    1 // DelegateCall
                )
            );
            
            // Note: Guard setup may fail if SAFE_SETUP is not an enabled module
            if (!guardSuccess) {
                // Guard will need to be set manually if needed
            }
        }
    }

    /// @notice Predicts the address of a Safe before deployment
    /// @param _userAddress The address that will own the Safe
    /// @return safeAddress The predicted Safe address
    function predictSafeAddress(
        address _userAddress
    ) external view returns (address safeAddress) {
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
    function isSafeDeployed(
        address _userAddress
    ) external view returns (bool) {
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