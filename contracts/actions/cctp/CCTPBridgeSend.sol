// SPDX-License-Identifier: LicenseRef-Brava-Commercial-License-1.0
pragma solidity =0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {ActionBase} from "../ActionBase.sol";
import {IActionWithBundleContext} from "../../interfaces/IActionWithBundleContext.sol";
import {Errors} from "../../Errors.sol";
import {ITokenMessengerV2} from "../../interfaces/ICCTP.sol";
import {IEip712TypedDataSafeModule} from "../../interfaces/IEip712TypedDataSafeModule.sol";

/// @title CCTPBridgeSend - Cross-chain USDC bridging with hooks
/// @notice Bridges USDC and bundle data via CCTP V2 hooks for native destination execution
/// @dev Uses Circle TokenMessenger V2 depositForBurnWithHook; USDC is minted to the Safe on destination
/// @dev The action executes via delegatecall from the Safe, so address(this) is the Safe during execution
/// @notice Found a vulnerability? Please contact security@bravalabs.xyz - we appreciate responsible disclosure and reward ethical hackers
contract CCTPBridgeSend is ActionBase, IActionWithBundleContext {
    using SafeERC20 for IERC20;

    // ========== CCTP V2 FAST TRANSFER CONSTANTS ==========
    
    /// @notice Finality threshold for fast transfers (enables ~8 second attestation)
    uint32 public constant FAST_FINALITY_THRESHOLD = 1000;
    
    /// @notice Finality threshold for standard transfers (13-19 minutes)
    uint32 public constant STANDARD_FINALITY_THRESHOLD = 2000;
    
    /// @notice Default maximum fee for fast transfers (1 USDC)
    uint256 public constant DEFAULT_FAST_MAX_FEE = 1000000; // 1 USDC in 6 decimals
    
    /// @notice Default maximum fee for standard transfers (free)
    uint256 public constant DEFAULT_STANDARD_MAX_FEE = 0;

    /// @notice CCTP V2 parameters with hook-based execution
    /// @param usdcToken Address of the USDC token to bridge
    /// @param amount Amount of USDC to bridge (in USDC units, e.g. 1000000 = $1 USDC)
    /// @param destinationDomain Destination domain ID for CCTP (3 = Arbitrum, 6 = Base, etc.)
    /// @param destinationCaller The destination receiver contract authorized by Circle's MessageTransmitter
    /// @param maxFee Maximum fee in USDC units (1000000 = $1 for fast, 0 = free for standard)
    /// @param minFinalityThreshold Minimum finality threshold (1000 = fast ~8s, 2000 = standard ~13-19min)
    struct CCTPParamsV2 {
        address usdcToken;
        uint256 amount;
        uint32 destinationDomain;
        bytes32 destinationCaller;      // Who can call receiveMessage (typically TypedDataModule)
        uint256 maxFee;                 // Fee for fast transfer (1000000 = $1 USDC)
        uint32 minFinalityThreshold;    // Finality threshold (1000 = fast, 2000 = standard)
    }

    // CCTP always transports bundle context in hook data for destination execution

    /// @notice CCTP V2 TokenMessenger contract
    ITokenMessengerV2 public immutable TOKEN_MESSENGER;

    /// @inheritdoc ActionBase
    function actionType() public pure override returns (uint8) {
        return 12; // CCTP Bridge Action V2
    }

    /// @inheritdoc ActionBase
    function protocolName() public pure override returns (string memory) {
        return "CCTP_V2";
    }

    /// @notice Event emitted when CCTP bridge is executed
    /// @param safeAddress Safe that initiated the bridge
    /// @param amount Amount of USDC bridged
    /// @param destinationDomain Destination domain ID
    /// @param destinationCaller Who can execute on destination
    /// @param hasBundle Whether bundle data was included
    event CCTPBridgeExecuted(
        address indexed safeAddress,
        uint256 amount,
        uint32 destinationDomain,
        bytes32 destinationCaller,
        bool hasBundle
    );

    constructor(address _adminVault, address _logger, address _tokenMessenger) ActionBase(_adminVault, _logger) {
        require(_tokenMessenger != address(0), "Invalid TokenMessenger address");
        TOKEN_MESSENGER = ITokenMessengerV2(_tokenMessenger);
    }

    /// @inheritdoc ActionBase
    function executeAction(bytes memory _callData, uint16 _strategyId) public payable override {
        // Parse calldata - CCTP always includes bundle context
        (CCTPParamsV2 memory cctpParams, IEip712TypedDataSafeModule.Bundle memory bundle, bytes memory signature) = 
            abi.decode(_callData, (CCTPParamsV2, IEip712TypedDataSafeModule.Bundle, bytes));

        // Validate inputs
        require(cctpParams.usdcToken != address(0), "Invalid USDC token address");
        require(cctpParams.amount > 0, "Bridge amount must be greater than 0");
        require(cctpParams.destinationDomain != 0, "Invalid destination domain");
        require(cctpParams.destinationCaller != bytes32(0), "Invalid destination caller");
        require(signature.length > 0, "Bundle signature required for CCTP");

        _executeCCTPBridge(cctpParams, bundle, signature, _strategyId);
    }

    /// @inheritdoc IActionWithBundleContext
    function executeActionWithBundleContext(
        bytes calldata _callData,
        IEip712TypedDataSafeModule.Bundle calldata _bundle,
        bytes calldata _signature,
        uint16 _strategyId
    ) external payable override {
        // Simplified direct tuple encoding only: abi.encode(address,uint256,uint32,bytes32,uint256,uint32)
        CCTPParamsV2 memory cctpParams;
        (
            cctpParams.usdcToken,
            cctpParams.amount,
            cctpParams.destinationDomain,
            cctpParams.destinationCaller,
            cctpParams.maxFee,
            cctpParams.minFinalityThreshold
        ) = abi.decode(_callData, (address, uint256, uint32, bytes32, uint256, uint32));

        // Validate inputs
        require(cctpParams.usdcToken != address(0), "Invalid USDC token address");
        require(cctpParams.amount > 0, "Bridge amount must be greater than 0");
        require(cctpParams.destinationDomain != 0, "Invalid destination domain");
        require(cctpParams.destinationCaller != bytes32(0), "Invalid destination caller");

        require(_signature.length > 0, "Bundle signature required for CCTP");
        
        _executeCCTPBridge(cctpParams, _bundle, _signature, _strategyId);
    }

    /// @notice Checks interface support for ERC165 and IActionWithBundleContext
    function supportsInterface(bytes4 interfaceId) public pure returns (bool) {
        return interfaceId == type(IActionWithBundleContext).interfaceId ||
               interfaceId == type(IERC165).interfaceId;
    }

    /// @notice Execute CCTP V2 bridge with hook data
    /// @param cctpParams CCTP V2 parameters including fees and finality thresholds
    /// @param bundle Bundle for cross-chain execution
    /// @param signature Bundle signature for execution
    function _executeCCTPBridge(
        CCTPParamsV2 memory cctpParams,
        IEip712TypedDataSafeModule.Bundle memory bundle,
        bytes memory signature,
        uint16 /* strategyId */
    ) internal {
        // address(this) is always the Safe in delegate call context
        uint256 balanceBefore = IERC20(cctpParams.usdcToken).balanceOf(address(this));

        // Validate sufficient balance
        require(balanceBefore >= cctpParams.amount, "Insufficient USDC balance for bridge");

        // Approve USDC to TokenMessenger - Safe approves in delegate call context
        IERC20(cctpParams.usdcToken).safeIncreaseAllowance(address(TOKEN_MESSENGER), cctpParams.amount);

        // Encode hook payload for destination bundle execution
        bytes memory hookData = _encodeHookData(bundle, signature);

        // USDC is minted to the Safe (address(this) in delegatecall context)
        bytes32 mintRecipient = bytes32(uint256(uint160(address(this))));

        // Call CCTP V2 depositForBurnWithHook
        // Use low-level call to capture exact revert reason
        
        bytes memory cctpCallData = abi.encodeWithSelector(
            ITokenMessengerV2.depositForBurnWithHook.selector,
            cctpParams.amount,
            cctpParams.destinationDomain,
            mintRecipient,
            cctpParams.usdcToken,
            cctpParams.destinationCaller,
            cctpParams.maxFee,
            cctpParams.minFinalityThreshold,
            hookData
        );
        
        (bool success, bytes memory returnData) = address(TOKEN_MESSENGER).call(cctpCallData);
        
        if (success) {
            // CCTP call succeeded
        } else {
        // CCTP call failed - forward the revert reason if available
            if (returnData.length > 0) {
                assembly {
                    revert(add(returnData, 0x20), mload(returnData))
                }
            } else {
                revert("CCTP bridge failed");
            }
        }

        // Verify balance change matches the burned amount
        uint256 balanceAfter = IERC20(cctpParams.usdcToken).balanceOf(address(this));

        require(
            balanceBefore - balanceAfter == cctpParams.amount,
            "Unexpected balance change"
        );

        // Emit event
        emit CCTPBridgeExecuted(
            address(this),
            cctpParams.amount,
            cctpParams.destinationDomain,
            cctpParams.destinationCaller,
            true // Always has bundle
        );
    }

    // CCTP expects (CCTPParamsV2, Bundle, bytes) when executed with bundle context

    /// @notice Encode bundle and signature as hook data for CCTP V2
    function _encodeHookData(
        IEip712TypedDataSafeModule.Bundle memory bundle,
        bytes memory signature
    ) private view returns (bytes memory) {
        // The Safe address is address(this) under delegatecall from the Safe
        address safeAddress = address(this);

        // Encode the full bundle; the destination EIP712 module enforces chain/nonce validation
        bytes memory hookData = abi.encode(
            IEip712TypedDataSafeModule.executeBundle.selector,
            safeAddress,
            bundle,
            signature
        );

        return hookData;
    }

    /// @notice Helper function to create fast transfer parameters
    /// @param usdcToken USDC token address
    /// @param amount Amount to bridge
    /// @param destinationDomain Destination domain
    /// @param destinationCaller Who can call receiveMessage
    /// @param customMaxFee Custom max fee (0 = use default $1 USDC)
    /// @return CCTPParamsV2 configured for fast transfer (~8 seconds)
    function createFastTransferParams(
        address usdcToken,
        uint256 amount,
        uint32 destinationDomain,
        address destinationCaller,
        uint256 customMaxFee
    ) external pure returns (CCTPParamsV2 memory) {
        return CCTPParamsV2({
            usdcToken: usdcToken,
            amount: amount,
            destinationDomain: destinationDomain,
            destinationCaller: bytes32(uint256(uint160(destinationCaller))),
            maxFee: customMaxFee > 0 ? customMaxFee : DEFAULT_FAST_MAX_FEE,
            minFinalityThreshold: FAST_FINALITY_THRESHOLD
        });
    }

    /// @notice Helper function to create standard transfer parameters
    /// @param usdcToken USDC token address
    /// @param amount Amount to bridge
    /// @param destinationDomain Destination domain
    /// @param destinationCaller Who can call receiveMessage
    /// @return CCTPParamsV2 configured for standard transfer (free but ~13-19 minutes)
    function createStandardTransferParams(
        address usdcToken,
        uint256 amount,
        uint32 destinationDomain,
        address destinationCaller
    ) external pure returns (CCTPParamsV2 memory) {
        return CCTPParamsV2({
            usdcToken: usdcToken,
            amount: amount,
            destinationDomain: destinationDomain,
            destinationCaller: bytes32(uint256(uint160(destinationCaller))),
            maxFee: DEFAULT_STANDARD_MAX_FEE,
            minFinalityThreshold: STANDARD_FINALITY_THRESHOLD
        });
    }

    /// @notice Helper function to create CCTP parameters for hook-based execution
    /// @param usdcToken USDC token address
    /// @param amount Amount to bridge
    /// @param destinationDomain Destination domain
    /// @param destinationCaller Who can call receiveMessage (typically TypedDataModule)
    /// @param maxFee Maximum fee for transfer
    /// @param minFinalityThreshold Finality threshold
    /// @return CCTPParamsV2 configured for hook execution
    function createHookParams(
        address usdcToken,
        uint256 amount,
        uint32 destinationDomain,
        address destinationCaller,
        uint256 maxFee,
        uint32 minFinalityThreshold
    ) external pure returns (CCTPParamsV2 memory) {
        return CCTPParamsV2({
            usdcToken: usdcToken,
            amount: amount,
            destinationDomain: destinationDomain,
            destinationCaller: bytes32(uint256(uint160(destinationCaller))),
            maxFee: maxFee,
            minFinalityThreshold: minFinalityThreshold
        });
    }
} 