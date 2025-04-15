// SPDX-License-Identifier: MIT
pragma solidity =0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ActionBase} from "../ActionBase.sol";
import {Errors} from "../../Errors.sol";
import {IMessageTransmitterV2} from "../../interfaces/ICCTP.sol";

/// @title CCTPReceiveMessage - Action for receiving CCTP v2 messages and tokens
/// @notice Handles receiving cross-chain messages, executing hooks, and distributing received USDC
/// @notice Found a vulnerability? Please contact security@bravalabs.xyz - we appreciate responsible disclosure and reward ethical hackers
contract CCTPReceiveMessage is ActionBase {
    using SafeERC20 for IERC20;

    /// @notice Parameters for receiving a message via CCTP
    /// @param message The CCTP message
    /// @param attestation The attestation for the message
    /// @param token Optional token to check for receipt (e.g., USDC)
    /// @param recipient Optional recipient to transfer received tokens to
    /// @param executeHook Whether to attempt hook execution if the message contains hook data
    struct Params {
        bytes message;
        bytes attestation;
        address token;
        address recipient;
        bool executeHook;
    }

    /// @notice The MessageTransmitterV2 contract
    IMessageTransmitterV2 public immutable MESSAGE_TRANSMITTER;

    /// @notice Constants for hook handling
    uint256 private constant ADDRESS_BYTE_LENGTH = 20;
    uint256 private constant CCTP_MESSAGE_HEADER_LENGTH = 148;

    /// @notice Event for tracking hook execution results
    /// @param success Whether the hook execution was successful
    /// @param target The target contract called
    /// @param returnData The return data from the call
    event HookExecuted(bool success, address indexed target, bytes returnData);

    /// @notice Initializes the CCTPReceiveMessage contract
    /// @param _adminVault Address of the admin vault
    /// @param _logger Address of the logger contract
    /// @param _messageTransmitter Address of the MessageTransmitterV2 contract
    constructor(address _adminVault, address _logger, address _messageTransmitter) ActionBase(_adminVault, _logger) {
        require(_messageTransmitter != address(0), Errors.InvalidInput("CCTPReceiveMessage", "constructor"));
        MESSAGE_TRANSMITTER = IMessageTransmitterV2(_messageTransmitter);
    }

    /// @inheritdoc ActionBase
    function executeAction(bytes memory _callData, uint16 _strategyId) public payable override {
        // Parse inputs
        Params memory inputData = _parseInputs(_callData);

        // Check inputs
        require(
            inputData.message.length > 0 && inputData.attestation.length > 0,
            Errors.InvalidInput("CCTPReceiveMessage", "executeAction")
        );

        // Track token balance before (if applicable)
        uint256 balanceBefore = 0;
        uint256 balanceAfter = 0;
        
        if (inputData.token != address(0)) {
            balanceBefore = IERC20(inputData.token).balanceOf(address(this));
        }

        // Receive message
        bool success = MESSAGE_TRANSMITTER.receiveMessage(inputData.message, inputData.attestation);
        require(success, "Message reception failed");

        // Track token balance after (if applicable)
        if (inputData.token != address(0)) {
            balanceAfter = IERC20(inputData.token).balanceOf(address(this));
        }

        // Execute hook if requested and message includes hook data
        bool hookSuccess = false;
        address hookTarget = address(0);
        bytes memory hookReturnData = "";
        
        if (inputData.executeHook && inputData.message.length > CCTP_MESSAGE_HEADER_LENGTH) {
            bytes memory messageBody = _extractMessageBody(inputData.message);
            (hookSuccess, hookTarget, hookReturnData) = _processHookData(messageBody);
            
            if (hookTarget != address(0)) {
                emit HookExecuted(hookSuccess, hookTarget, hookReturnData);
            }
        }

        // Transfer received tokens if applicable
        if (inputData.token != address(0) && inputData.recipient != address(0) && balanceAfter > balanceBefore) {
            uint256 amountReceived = balanceAfter - balanceBefore;
            IERC20(inputData.token).safeTransfer(inputData.recipient, amountReceived);
            
            // Update final balance after transfer
            balanceAfter = IERC20(inputData.token).balanceOf(address(this));
        }

        // Log event
        bytes memory encodedData = _encodeReceiveData(
            _strategyId,
            inputData.token != address(0) ? inputData.token : hookTarget,
            balanceAfter > balanceBefore ? balanceAfter - balanceBefore : 0,
            inputData.recipient,
            balanceBefore,
            balanceAfter,
            hookTarget,
            hookSuccess
        );
        LOGGER.logActionEvent(LogType.BALANCE_UPDATE, encodedData);
    }

    /// @inheritdoc ActionBase
    function actionType() public pure override returns (uint8) {
        return uint8(ActionType.DEPOSIT_ACTION);
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

    /// @notice Extracts the message body from a CCTP message
    /// @param message The CCTP message
    /// @return messageBody The extracted message body
    function _extractMessageBody(bytes memory message) internal pure returns (bytes memory messageBody) {
        if (message.length <= CCTP_MESSAGE_HEADER_LENGTH) {
            return new bytes(0);
        }
        
        // Message body starts after header
        uint256 bodyLength = message.length - CCTP_MESSAGE_HEADER_LENGTH;
        messageBody = new bytes(bodyLength);
        
        for (uint256 i = 0; i < bodyLength; i++) {
            messageBody[i] = message[CCTP_MESSAGE_HEADER_LENGTH + i];
        }
    }

    /// @notice Processes hook data and executes the hook
    /// @param messageBody The message body containing hook data
    /// @return success Whether the hook execution was successful
    /// @return hookTarget The target contract for the hook
    /// @return returnData The return data from the hook execution
    function _processHookData(bytes memory messageBody) internal returns (bool success, address hookTarget, bytes memory returnData) {
        if (messageBody.length < ADDRESS_BYTE_LENGTH) {
            return (false, address(0), "");
        }
        
        hookTarget = _extractTargetAddress(messageBody);
        bytes memory hookCalldata = _extractCalldata(messageBody);
        
        if (hookTarget != address(0)) {
            (success, returnData) = _executeHook(hookTarget, hookCalldata);
        }
    }

    /// @notice Extracts the target address from the hook data
    /// @param messageBody The message body containing hook data
    /// @return targetAddress The extracted target address
    function _extractTargetAddress(bytes memory messageBody) internal pure returns (address targetAddress) {
        if (messageBody.length >= ADDRESS_BYTE_LENGTH) {
            assembly {
                targetAddress := mload(add(add(messageBody, 0x20), 0))
                // Clear upper 96 bits
                targetAddress := and(targetAddress, 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF)
            }
        }
    }

    /// @notice Extracts the calldata from the hook data
    /// @param messageBody The message body containing hook data
    /// @return hookCalldata The extracted calldata
    function _extractCalldata(bytes memory messageBody) internal pure returns (bytes memory hookCalldata) {
        if (messageBody.length > ADDRESS_BYTE_LENGTH) {
            uint256 calldataLength = messageBody.length - ADDRESS_BYTE_LENGTH;
            hookCalldata = new bytes(calldataLength);
            
            for (uint256 i = 0; i < calldataLength; i++) {
                hookCalldata[i] = messageBody[ADDRESS_BYTE_LENGTH + i];
            }
        } else {
            hookCalldata = new bytes(0);
        }
    }

    /// @notice Executes a hook by calling the target address with the provided calldata
    /// @param hookTarget The target address to call
    /// @param hookCalldata The calldata to use in the call
    /// @return success Whether the call was successful
    /// @return returnData The return data from the call
    function _executeHook(address hookTarget, bytes memory hookCalldata) 
        internal 
        returns (bool success, bytes memory returnData) 
    {
        (success, returnData) = hookTarget.call(hookCalldata);
        // Note: We don't revert if the hook execution fails to ensure the message is still processed
    }

    /// @notice Encodes receive data for logging
    /// @param _strategyId ID of the strategy
    /// @param _token Address of the token or hook target
    /// @param _amount Amount of tokens received (if any)
    /// @param _recipient Recipient of tokens (if any)
    /// @param _balanceBefore Balance before the action
    /// @param _balanceAfter Balance after the action
    /// @param _hookTarget Address of the hook target (if any)
    /// @param _hookSuccess Whether the hook execution was successful
    /// @return bytes Encoded receive data
    function _encodeReceiveData(
        uint16 _strategyId,
        address _token,
        uint256 _amount,
        address _recipient,
        uint256 _balanceBefore,
        uint256 _balanceAfter,
        address _hookTarget,
        bool _hookSuccess
    ) internal pure returns (bytes memory) {
        return abi.encode(
            _strategyId,
            _token,
            _amount,
            _recipient,
            _balanceBefore,
            _balanceAfter,
            _hookTarget,
            _hookSuccess
        );
    }
} 