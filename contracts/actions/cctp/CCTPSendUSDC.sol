// SPDX-License-Identifier: MIT
pragma solidity =0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ActionBase} from "../ActionBase.sol";
import {Errors} from "../../Errors.sol";
import {ITokenMessengerV2} from "../../interfaces/ICCTP.sol";

/// @title CCTPSendUSDC - Action for sending USDC cross-chain through CCTP v2
/// @notice Allows bridging USDC tokens with optional hook data for execution on the destination chain
/// @notice Found a vulnerability? Please contact security@bravalabs.xyz - we appreciate responsible disclosure and reward ethical hackers
contract CCTPSendUSDC is ActionBase {
    using SafeERC20 for IERC20;

    /// @notice Parameters for sending USDC via CCTP
    /// @param usdcToken Address of the USDC token to bridge
    /// @param amount Amount of USDC to bridge
    /// @param destinationDomain Destination domain ID
    /// @param mintRecipient Address of recipient on destination chain (as bytes32)
    /// @param destinationCaller Authorized caller on destination chain (as bytes32)
    /// @param maxFee Maximum fee in USDC units
    /// @param minFinalityThreshold Minimum finality threshold for attestation
    /// @param includeHook Whether to include hook data
    /// @param targetContract Target contract for hook execution (used only if includeHook is true)
    /// @param callData Call data for hook execution (used only if includeHook is true)
    struct Params {
        address usdcToken;
        uint256 amount;
        uint32 destinationDomain;
        bytes32 mintRecipient;
        bytes32 destinationCaller;
        uint256 maxFee;
        uint32 minFinalityThreshold;
        bool includeHook;
        address targetContract;
        bytes callData;
    }

    /// @notice The TokenMessengerV2 contract
    ITokenMessengerV2 public immutable TOKEN_MESSENGER;

    /// @notice Initializes the CCTPSendUSDC contract
    /// @param _adminVault Address of the admin vault
    /// @param _logger Address of the logger contract
    /// @param _tokenMessenger Address of the TokenMessengerV2 contract
    constructor(address _adminVault, address _logger, address _tokenMessenger) ActionBase(_adminVault, _logger) {
        require(_tokenMessenger != address(0), Errors.InvalidInput("CCTPSendUSDC", "constructor"));
        TOKEN_MESSENGER = ITokenMessengerV2(_tokenMessenger);
    }

    /// @inheritdoc ActionBase
    function executeAction(bytes memory _callData, uint16 _strategyId) public payable override {
        // Parse inputs
        Params memory inputData = _parseInputs(_callData);

        // Check inputs
        require(
            inputData.usdcToken != address(0) && 
            inputData.amount > 0 && 
            inputData.destinationDomain != 0 && 
            inputData.mintRecipient != bytes32(0),
            Errors.InvalidInput("CCTPSendUSDC", "executeAction")
        );

        // Get balance before
        uint256 balanceBefore = IERC20(inputData.usdcToken).balanceOf(address(this));

        // Approve token transfer to TokenMessenger
        IERC20(inputData.usdcToken).safeIncreaseAllowance(address(TOKEN_MESSENGER), inputData.amount);

        // Prepare optional hook data and execute token burn
        if (inputData.includeHook && inputData.targetContract != address(0)) {
            // Format hook data (target contract address + calldata)
            bytes memory hookData = abi.encodePacked(inputData.targetContract, inputData.callData);
            
            // Execute burn with hook data
            TOKEN_MESSENGER.depositForBurnWithHook(
                inputData.amount,
                inputData.destinationDomain,
                inputData.mintRecipient,
                inputData.usdcToken,
                inputData.destinationCaller,
                inputData.maxFee,
                inputData.minFinalityThreshold,
                hookData
            );
        } else {
            // Execute burn without hook data
            TOKEN_MESSENGER.depositForBurn(
                inputData.amount,
                inputData.destinationDomain,
                inputData.mintRecipient,
                inputData.usdcToken,
                inputData.destinationCaller,
                inputData.maxFee,
                inputData.minFinalityThreshold
            );
        }

        // Get balance after
        uint256 balanceAfter = IERC20(inputData.usdcToken).balanceOf(address(this));

        // Log event
        bytes memory encodedData = _encodeUsdcData(
            _strategyId,
            inputData.usdcToken,
            inputData.amount,
            inputData.destinationDomain,
            inputData.mintRecipient,
            balanceBefore,
            balanceAfter,
            inputData.includeHook ? inputData.targetContract : address(0)
        );
        LOGGER.logActionEvent(LogType.SEND_TOKEN, encodedData);
    }

    /// @inheritdoc ActionBase
    function actionType() public pure override returns (uint8) {
        return uint8(ActionType.TRANSFER_ACTION);
    }

    /// @inheritdoc ActionBase
    function protocolName() public pure override returns (string memory) {
        return "CCTP";
    }

    //////////////////////////// HELPER FUNCTIONS ////////////////////////////

    /// @notice Parses input data for the action
    /// @param _callData The encoded input data
    /// @return inputData The decoded input parameters
    function _parseInputs(bytes memory _callData) private pure returns (Params memory inputData) {
        inputData = abi.decode(_callData, (Params));
    }

    /// @notice Encodes USDC transfer data for logging
    /// @param _strategyId ID of the strategy
    /// @param _usdcToken Address of the USDC token
    /// @param _amount Amount of USDC
    /// @param _destinationDomain Destination domain ID
    /// @param _mintRecipient Recipient on destination chain
    /// @param _balanceBefore Balance before the action
    /// @param _balanceAfter Balance after the action
    /// @param _targetContract Target contract (if any)
    /// @return bytes Encoded USDC data
    function _encodeUsdcData(
        uint16 _strategyId,
        address _usdcToken,
        uint256 _amount,
        uint32 _destinationDomain,
        bytes32 _mintRecipient,
        uint256 _balanceBefore,
        uint256 _balanceAfter,
        address _targetContract
    ) internal pure returns (bytes memory) {
        return abi.encode(
            _strategyId,
            _usdcToken,
            _amount,
            _destinationDomain,
            _mintRecipient,
            _balanceBefore,
            _balanceAfter,
            _targetContract
        );
    }
} 