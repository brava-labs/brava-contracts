// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {ISafe} from "../interfaces/safe/ISafe.sol";
import {ActionBase} from "../actions/ActionBase.sol";
import {IAdminVault} from "../interfaces/IAdminVault.sol";
import {Enum} from "../libraries/Enum.sol";
import {Errors} from "../Errors.sol";
import {Roles} from "./Roles.sol";

/// @title FeeTakeSafeModule
/// @notice This is a safe module that will allow a bot (as permissioned by the admin vault) to take fees from the pools
/// @notice It creates a sequence of deposit actions with 0 amounts to trigger the fee taking mechanism
contract FeeTakeSafeModule is Roles {
    struct Sequence {
        string name;
        bytes[] callData;
        bytes4[] actionIds;
    }

    struct DepositParams {
        bytes4 poolId;
        uint16 feeBasis;
        uint256 amount;
        uint256 minSharesReceived;
    }

    IAdminVault public immutable ADMIN_VAULT;
    bytes4 public constant EXECUTE_ACTION_SELECTOR = bytes4(keccak256("executeAction(bytes,uint16)"));
    bytes4 public constant EXECUTE_SEQUENCE_SELECTOR = bytes4(keccak256("executeSequence((string,bytes[],bytes4[]))"));
    address public immutable SEQUENCE_EXECUTOR_ADDR;

    constructor(address _adminVault, address _sequenceExecutor) {
        ADMIN_VAULT = IAdminVault(_adminVault);
        SEQUENCE_EXECUTOR_ADDR = _sequenceExecutor;
    }

    /// @notice Allows address with FEE_TAKER_ROLE to take fees from the user
    /// @notice It creates a sequence of deposit actions with 0 amounts to trigger the fee taking mechanism
    /// @param _safeAddr Address of the users Safe
    /// @param _actionIds Array of action ids
    /// @param _poolIds Array of pool ids
    /// @param _feeBases Array of fee bases
    function takeFees(
        address _safeAddr,
        bytes4[] memory _actionIds,
        bytes4[] memory _poolIds,
        uint16[] memory _feeBases
    ) external payable {
        // check if the sender has the fee taker role
        if (!ADMIN_VAULT.hasRole(FEE_TAKER_ROLE, msg.sender)) {
            revert Errors.FeeTakeSafeModule_SenderNotFeeTaker(msg.sender);
        }

        // create a sequence of actions to take fees from the pools
        Sequence memory sequence;
        sequence.name = "FeeTakingSequence";
        sequence.callData = new bytes[](_actionIds.length);
        sequence.actionIds = _actionIds;

        for (uint256 i = 0; i < _actionIds.length; i++) {
            bytes4 actionId = _actionIds[i];
            bytes4 poolId = _poolIds[i];

            ActionBase action = ActionBase(ADMIN_VAULT.getActionAddress(actionId));
            // check if the action is a deposit action
            if (action.actionType() != uint8(ActionBase.ActionType.DEPOSIT_ACTION)) {
                revert Errors.FeeTakeSafeModule_InvalidActionType(actionId);
            }

            // create the deposit action params
            DepositParams memory depositParams;
            depositParams.poolId = poolId;
            depositParams.feeBasis = _feeBases[i];
            depositParams.amount = 0;
            depositParams.minSharesReceived = 0;

            // encode the call data
            bytes memory paramsEncoded = abi.encode(depositParams);
            bytes memory callData = abi.encodeWithSelector(
                EXECUTE_ACTION_SELECTOR,
                paramsEncoded,
                0
            );
            sequence.callData[i] = callData;
        }

        // encode the sequence data
        bytes memory sequenceData = abi.encodeWithSelector(
            EXECUTE_SEQUENCE_SELECTOR,
            sequence
        );
        // execute the sequence
        bool success = ISafe(_safeAddr).execTransactionFromModule(
            SEQUENCE_EXECUTOR_ADDR,
            msg.value,
            sequenceData,
            Enum.Operation.DelegateCall
        );
        if (!success) {
            revert Errors.FeeTakeSafeModule_ExecutionFailed();
        }
    }
}
