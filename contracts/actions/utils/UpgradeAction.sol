// SPDX-License-Identifier: MIT
pragma solidity =0.8.28;

import {ActionBase} from "../ActionBase.sol";
import {Errors} from "../../Errors.sol";
import {ITransactionRegistry} from "../../interfaces/ITransactionRegistry.sol";

/// @title UpgradeAction - An action for executing pre-approved upgrade transactions
/// @notice This contract allows execution of pre-approved upgrade transactions through the sequence executor
/// @notice Found a vulnerability? Please contact security@bravalabs.xyz - we appreciate responsible disclosure and reward ethical hackers
contract UpgradeAction is ActionBase {
    /// @notice The transaction registry contract
    ITransactionRegistry public immutable TRANSACTION_REGISTRY;

    constructor(address _adminVault, address _logger, address _transactionRegistry) ActionBase(_adminVault, _logger) {
        require(_transactionRegistry != address(0), Errors.InvalidInput("UpgradeAction", "constructor"));
        TRANSACTION_REGISTRY = ITransactionRegistry(_transactionRegistry);
    }

    /// @inheritdoc ActionBase
    function executeAction(bytes memory _callData, uint16 /*_strategyId*/) public payable override {
        // Decode the bytes parameter to get the raw transaction data
        bytes memory data = abi.decode(_callData, (bytes));

        // Check if transaction is approved in TransactionRegistry
        bytes32 txHash = keccak256(abi.encode(data));

        bool isApproved = TRANSACTION_REGISTRY.isApprovedTransaction(txHash);
        require(isApproved, Errors.UpgradeAction_TransactionNotApproved(txHash));

        // Execute the upgrade transaction, we must use a low level call for this.
        // solhint-disable-next-line avoid-low-level-calls
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
