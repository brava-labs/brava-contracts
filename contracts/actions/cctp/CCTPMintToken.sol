// SPDX-License-Identifier: MIT
pragma solidity =0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ActionBase} from "../ActionBase.sol";
import {Errors} from "../../Errors.sol";
import {IMessageTransmitterV2} from "../../interfaces/ICCTP.sol";

/// @title CCTPMintToken - Action for minting tokens through CCTP v2
/// @notice Allows receiving and minting USDC tokens that have been bridged from another chain using CCTP v2
/// @notice Found a vulnerability? Please contact security@bravalabs.xyz - we appreciate responsible disclosure and reward ethical hackers
contract CCTPMintToken is ActionBase {
    using SafeERC20 for IERC20;

    /// @notice Parameters for minting tokens via CCTP
    /// @param message The CCTP message containing mint information
    /// @param attestation The attestation for the message
    /// @param mintToken The token to be minted (USDC)
    /// @param receiver The address that will receive the minted tokens
    struct Params {
        bytes message;
        bytes attestation;
        address mintToken;
        address receiver;
    }

    /// @notice The MessageTransmitterV2 contract
    IMessageTransmitterV2 public immutable MESSAGE_TRANSMITTER;

    /// @notice Initializes the CCTPMintToken contract
    /// @param _adminVault Address of the admin vault
    /// @param _logger Address of the logger contract
    /// @param _messageTransmitter Address of the MessageTransmitterV2 contract
    constructor(address _adminVault, address _logger, address _messageTransmitter) ActionBase(_adminVault, _logger) {
        require(_messageTransmitter != address(0), Errors.InvalidInput("CCTPMintToken", "constructor"));
        MESSAGE_TRANSMITTER = IMessageTransmitterV2(_messageTransmitter);
    }

    /// @inheritdoc ActionBase
    function executeAction(bytes memory _callData, uint16 _strategyId) public payable override {
        // Parse inputs
        Params memory inputData = _parseInputs(_callData);

        // Check inputs
        require(
            inputData.message.length > 0 && inputData.attestation.length > 0 && inputData.mintToken != address(0),
            Errors.InvalidInput("CCTPMintToken", "executeAction")
        );

        // Get balance before
        uint256 balanceBefore = IERC20(inputData.mintToken).balanceOf(address(this));

        // Receive message to trigger minting
        bool success = MESSAGE_TRANSMITTER.receiveMessage(inputData.message, inputData.attestation);
        require(success, "Message reception failed");

        // Get balance after
        uint256 balanceAfter = IERC20(inputData.mintToken).balanceOf(address(this));
        uint256 mintedAmount = balanceAfter - balanceBefore;

        // Transfer minted tokens to receiver if specified
        if (inputData.receiver != address(0) && inputData.receiver != address(this) && mintedAmount > 0) {
            IERC20(inputData.mintToken).safeTransfer(inputData.receiver, mintedAmount);
        }

        // Log event
        bytes memory encodedData = _encodeMintTokenData(
            _strategyId,
            inputData.mintToken,
            mintedAmount,
            inputData.receiver,
            balanceBefore,
            balanceAfter
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

    /// @notice Encodes mint token data for logging
    /// @param _strategyId ID of the strategy
    /// @param _token Address of the token
    /// @param _amount Amount of tokens minted
    /// @param _receiver Address that received the minted tokens
    /// @param _balanceBefore Balance before the action
    /// @param _balanceAfter Balance after the action
    /// @return bytes Encoded mint token data
    function _encodeMintTokenData(
        uint16 _strategyId,
        address _token,
        uint256 _amount,
        address _receiver,
        uint256 _balanceBefore,
        uint256 _balanceAfter
    ) internal pure returns (bytes memory) {
        return abi.encode(
            _strategyId,
            _token,
            _amount,
            _receiver,
            _balanceBefore,
            _balanceAfter
        );
    }
} 