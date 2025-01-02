// SPDX-License-Identifier: MIT
pragma solidity =0.8.28;

import {ActionBase} from "../ActionBase.sol";
import {Errors} from "../../Errors.sol";
import {ITransactionRegistry} from "../../interfaces/ITransactionRegistry.sol";


/// @title UpgradeAction - An action for executing pre-approved upgrade transactions
/// @notice This contract allows execution of pre-approved upgrade transactions through the sequence executor
/// @notice Found a vulnerability? Please contact security@bravalabs.xyz - we appreciate responsible disclosure and reward ethical hackers
contract UpgradeAction is ActionBase {
    struct Params {
        bytes data;     // The calldata to execute
    }

    /// @notice The transaction registry contract
    ITransactionRegistry public immutable TRANSACTION_REGISTRY;

    constructor(
        address _adminVault,
        address _logger,
        address _transactionRegistry
    ) ActionBase(_adminVault, _logger) {
        require(_transactionRegistry != address(0), Errors.InvalidInput("UpgradeAction", "constructor"));
        TRANSACTION_REGISTRY = ITransactionRegistry(_transactionRegistry);
    }

    /// @inheritdoc ActionBase
    function executeAction(bytes memory _callData, uint16 /*_strategyId*/) public payable override {
        // Parse inputs - the data is directly encoded as bytes
        /// @dev Decoding bytes to bytes seems daft, but it fits the pattern of the other actions.
        bytes memory data = abi.decode(_callData, (bytes));
        
        // Check if transaction is approved in TransactionRegistry
        bytes32 txHash = keccak256(abi.encodePacked(data));

        bool isApproved = TRANSACTION_REGISTRY.isApprovedTransaction(txHash);
        require(isApproved, Errors.UpgradeAction_TransactionNotApproved(txHash));

        // Execute the upgrade transaction using delegatecall
        (bool success, ) = address(this).call(data);
        require(success, Errors.UpgradeAction_ExecutionFailed());

        // Log the event
        LOGGER.logActionEvent(LogType.UPGRADE_ACTION, abi.encode(address(this), txHash));
    }

    /// @inheritdoc ActionBase
    function actionType() public pure override returns (uint8) {
        return uint8(ActionType.CUSTOM_ACTION);
    }

    /// @inheritdoc ActionBase
    function protocolName() public pure override returns (string memory) {
        return "UpgradeAction";
    }
} 