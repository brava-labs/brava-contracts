// SPDX-License-Identifier: MIT
pragma solidity =0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ActionBase} from "../ActionBase.sol";
import {Errors} from "../../Errors.sol";
import {ITokenMessengerV2} from "../../interfaces/ICCTP.sol";

/// @title CCTPBurnToken - Action for burning tokens through CCTP v2
/// @notice Allows burning USDC tokens to be minted on the destination chain using CCTP v2
/// @notice Found a vulnerability? Please contact security@bravalabs.xyz - we appreciate responsible disclosure and reward ethical hackers
contract CCTPBurnToken is ActionBase {
    using SafeERC20 for IERC20;

    /// @notice Parameters for burning tokens via CCTP
    /// @param burnToken Address of token to burn (USDC)
    /// @param amount Amount of tokens to burn
    /// @param destinationDomain Destination domain ID
    /// @param mintRecipient Address of recipient on destination chain
    /// @param destinationCaller Authorized caller on destination domain (bytes32)
    /// @param maxFee Maximum fee in burnToken units
    /// @param minFinalityThreshold Minimum finality threshold for attestation
    /// @param hookData Optional hook data for execution on destination chain
    struct Params {
        address burnToken;
        uint256 amount;
        uint32 destinationDomain;
        bytes32 mintRecipient;
        bytes32 destinationCaller;
        uint256 maxFee;
        uint32 minFinalityThreshold;
        bytes hookData;
    }

    /// @notice The TokenMessengerV2 contract
    ITokenMessengerV2 public immutable TOKEN_MESSENGER;

    /// @notice Initializes the CCTPBurnToken contract
    /// @param _adminVault Address of the admin vault
    /// @param _logger Address of the logger contract
    /// @param _tokenMessenger Address of the TokenMessengerV2 contract
    constructor(address _adminVault, address _logger, address _tokenMessenger) ActionBase(_adminVault, _logger) {
        require(_tokenMessenger != address(0), Errors.InvalidInput("CCTPBurnToken", "constructor"));
        TOKEN_MESSENGER = ITokenMessengerV2(_tokenMessenger);
    }

    /// @inheritdoc ActionBase
    function executeAction(bytes memory _callData, uint16 _strategyId) public payable override {
        // Parse inputs
        Params memory inputData = _parseInputs(_callData);

        // Check inputs
        require(
            inputData.burnToken != address(0) && inputData.amount > 0 && inputData.mintRecipient != bytes32(0),
            Errors.InvalidInput("CCTPBurnToken", "executeAction")
        );

        // Get balance before
        uint256 balanceBefore = IERC20(inputData.burnToken).balanceOf(address(this));

        // Approve token transfer to TokenMessenger
        IERC20(inputData.burnToken).safeIncreaseAllowance(address(TOKEN_MESSENGER), inputData.amount);

        // Execute burn for cross-chain transfer
        if (inputData.hookData.length > 0) {
            TOKEN_MESSENGER.depositForBurnWithHook(
                inputData.amount,
                inputData.destinationDomain,
                inputData.mintRecipient,
                inputData.burnToken,
                inputData.destinationCaller,
                inputData.maxFee,
                inputData.minFinalityThreshold,
                inputData.hookData
            );
        } else {
            TOKEN_MESSENGER.depositForBurn(
                inputData.amount,
                inputData.destinationDomain,
                inputData.mintRecipient,
                inputData.burnToken,
                inputData.destinationCaller,
                inputData.maxFee,
                inputData.minFinalityThreshold
            );
        }

        // Get balance after
        uint256 balanceAfter = IERC20(inputData.burnToken).balanceOf(address(this));

        // Log event
        bytes memory encodedData = _encodeBurnTokenData(
            _strategyId,
            inputData.burnToken,
            inputData.amount,
            inputData.destinationDomain,
            inputData.mintRecipient,
            balanceBefore,
            balanceAfter
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

    /// @notice Encodes burn token data for logging
    /// @param _strategyId ID of the strategy
    /// @param _token Address of the token
    /// @param _amount Amount of tokens
    /// @param _destinationDomain Destination domain ID
    /// @param _mintRecipient Recipient on destination chain
    /// @param _balanceBefore Balance before the action
    /// @param _balanceAfter Balance after the action
    /// @return bytes Encoded burn token data
    function _encodeBurnTokenData(
        uint16 _strategyId,
        address _token,
        uint256 _amount,
        uint32 _destinationDomain,
        bytes32 _mintRecipient,
        uint256 _balanceBefore,
        uint256 _balanceAfter
    ) internal pure returns (bytes memory) {
        return abi.encode(
            _strategyId,
            _token,
            _amount,
            _destinationDomain,
            _mintRecipient,
            _balanceBefore,
            _balanceAfter
        );
    }
} 