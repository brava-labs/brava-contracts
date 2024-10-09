// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {ISafe} from "../interfaces/safe/ISafe.sol";
import {ActionBase} from "../actions/ActionBase.sol";
import {IAdminVault} from "../interfaces/IAdminVault.sol";
import {Enum} from "../libraries/Enum.sol";
import {Errors} from "../Errors.sol";

/// @title FeeTakeSafeModule
/// @notice This is a safe module that will allow a bot (as permissioned by the admin vault) to take fees from the pools
/// @notice It creates a sequence of deposit actions with 0 amounts to trigger the fee taking mechanism
contract FeeTakeSafeModule {
    struct Sequence {
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
    bytes32 public constant FEE_TAKER_ROLE = keccak256("FEE_TAKER_ROLE");
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
            bytes memory callData = abi.encode(depositParams);
            sequence.callData[i] = callData;
        }

        // encode the sequence data
        bytes memory sequenceData = abi.encodeWithSelector(
            bytes4(keccak256("executeSequence(bytes[], bytes4[])")),
            sequence.callData,
            sequence.actionIds
        );
        // execute the sequence
        ISafe(_safeAddr).execTransactionFromModule(
            SEQUENCE_EXECUTOR_ADDR,
            msg.value,
            sequenceData,
            Enum.Operation.DelegateCall
        );
    }
}
