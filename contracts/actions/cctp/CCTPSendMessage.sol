// SPDX-License-Identifier: MIT
pragma solidity =0.8.28;

import {ActionBase} from "../ActionBase.sol";
import {Errors} from "../../Errors.sol";
import {IMessageTransmitterV2} from "../../interfaces/ICCTP.sol";

/// @title CCTPSendMessage - Action for sending cross-chain messages through CCTP v2
/// @notice Allows sending arbitrary messages cross-chain using CCTP v2, with optional hook functionality
/// @notice Found a vulnerability? Please contact security@bravalabs.xyz - we appreciate responsible disclosure and reward ethical hackers
contract CCTPSendMessage is ActionBase {
    /// @notice Parameters for sending a message via CCTP
    /// @param destinationDomain Destination domain ID
    /// @param recipient Address of recipient on destination chain (as bytes32)
    /// @param destinationCaller Authorized caller on destination chain (as bytes32)
    /// @param minFinalityThreshold Minimum finality threshold for attestation
    /// @param messageBody The message payload to send (raw)
    /// @param isHookMessage If true, formats message body as a hook (targetContract/calldata will be read from messageBody)
    /// @param targetContract Target contract for hook execution (used only if isHookMessage is false)
    /// @param callData Call data for hook execution (used only if isHookMessage is false)
    struct Params {
        uint32 destinationDomain;
        bytes32 recipient;
        bytes32 destinationCaller;
        uint32 minFinalityThreshold;
        bytes messageBody;
        bool isHookMessage;
        address targetContract;
        bytes callData;
    }

    /// @notice The MessageTransmitterV2 contract
    IMessageTransmitterV2 public immutable MESSAGE_TRANSMITTER;

    /// @notice Initializes the CCTPSendMessage contract
    /// @param _adminVault Address of the admin vault
    /// @param _logger Address of the logger contract
    /// @param _messageTransmitter Address of the MessageTransmitterV2 contract
    constructor(address _adminVault, address _logger, address _messageTransmitter) ActionBase(_adminVault, _logger) {
        require(_messageTransmitter != address(0), Errors.InvalidInput("CCTPSendMessage", "constructor"));
        MESSAGE_TRANSMITTER = IMessageTransmitterV2(_messageTransmitter);
    }

    /// @inheritdoc ActionBase
    function executeAction(bytes memory _callData, uint16 _strategyId) public payable override {
        // Parse inputs
        Params memory inputData = _parseInputs(_callData);

        // Check inputs
        require(
            inputData.destinationDomain != 0 && 
            inputData.recipient != bytes32(0),
            Errors.InvalidInput("CCTPSendMessage", "executeAction")
        );

        // Prepare final message body
        bytes memory finalMessageBody;
        
        if (inputData.isHookMessage) {
            // Use raw message body directly if it's already a hook message
            require(inputData.messageBody.length > 0, "Message body cannot be empty for hook messages");
            finalMessageBody = inputData.messageBody;
        } else if (inputData.targetContract != address(0)) {
            // Format as hook message if target contract is provided
            finalMessageBody = abi.encodePacked(inputData.targetContract, inputData.callData);
        } else {
            // Use raw message body directly
            require(inputData.messageBody.length > 0, "Message body cannot be empty");
            finalMessageBody = inputData.messageBody;
        }

        // Send cross-chain message
        MESSAGE_TRANSMITTER.sendMessage(
            inputData.destinationDomain,
            inputData.recipient,
            inputData.destinationCaller,
            inputData.minFinalityThreshold,
            finalMessageBody
        );

        // Log event
        bytes memory encodedData = _encodeMessageData(
            _strategyId,
            inputData.destinationDomain,
            inputData.recipient,
            finalMessageBody
        );
        LOGGER.logActionEvent(LogType.SEND_TOKEN, encodedData);
    }

    /// @inheritdoc ActionBase
    function actionType() public pure override returns (uint8) {
        return uint8(ActionType.CUSTOM_ACTION);
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

    /// @notice Encodes message data for logging
    /// @param _strategyId ID of the strategy
    /// @param _destinationDomain Destination domain ID
    /// @param _recipient Recipient on destination chain
    /// @param _messageBody The message payload
    /// @return bytes Encoded message data
    function _encodeMessageData(
        uint16 _strategyId,
        uint32 _destinationDomain,
        bytes32 _recipient,
        bytes memory _messageBody
    ) internal pure returns (bytes memory) {
        return abi.encode(
            _strategyId,
            _destinationDomain,
            _recipient,
            _messageBody
        );
    }
} 