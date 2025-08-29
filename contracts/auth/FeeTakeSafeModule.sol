// SPDX-License-Identifier: MIT
pragma solidity =0.8.28;

import {ActionBase} from "../actions/ActionBase.sol";
import {Errors} from "../Errors.sol";
import {IAdminVault} from "../interfaces/IAdminVault.sol";
import {IEip712TypedDataSafeModule} from "../interfaces/IEip712TypedDataSafeModule.sol";
import {ISafe} from "../interfaces/safe/ISafe.sol";
import {Enum} from "../libraries/Enum.sol";
import {Roles} from "./Roles.sol";
import {ISequenceExecutor} from "../interfaces/ISequenceExecutor.sol";

/// @title FeeTakeSafeModule
/// @notice This is a safe module that will allow a bot (as permissioned by the admin vault) to take fees from the pools
/// @notice It creates a sequence of deposit actions with 0 amounts to trigger the fee taking mechanism
/// @notice Found a vulnerability? Please contact security@bravalabs.xyz - we appreciate responsible disclosure and reward ethical hackers
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
        require(
            ADMIN_VAULT.hasRole(FEE_TAKER_ROLE, msg.sender),
            Errors.FeeTakeSafeModule_SenderNotFeeTaker(msg.sender)
        );

        // basic input validation
        require(_safeAddr != address(0), Errors.InvalidInput("FeeTakeSafeModule", "takeFees"));
        require(
            _actionIds.length == _poolIds.length && _actionIds.length == _feeBases.length,
            Errors.FeeTakeSafeModule_LengthMismatch()
        );

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
            require(
                action.actionType() == uint8(ActionBase.ActionType.DEPOSIT_ACTION),
                Errors.FeeTakeSafeModule_InvalidActionType(actionId)
            );

            // create the deposit action params
            DepositParams memory depositParams;
            depositParams.poolId = poolId;
            depositParams.feeBasis = _feeBases[i];
            depositParams.amount = 0;
            depositParams.minSharesReceived = 0;

            // encode the call data
            bytes memory paramsEncoded = abi.encode(depositParams);
            bytes memory callData = abi.encodeWithSelector(EXECUTE_ACTION_SELECTOR, paramsEncoded, 0);
            sequence.callData[i] = callData;
        }

        // encode the sequence data with empty bundle for legacy compatibility
        IEip712TypedDataSafeModule.Bundle memory emptyBundle = IEip712TypedDataSafeModule.Bundle({
            expiry: 0,
            sequences: new IEip712TypedDataSafeModule.ChainSequence[](0)
        });
        bytes memory sequenceData = abi.encodeWithSelector(
            ISequenceExecutor.executeSequence.selector,
            sequence,
            emptyBundle,
            "",
            uint16(0)
        );
        // execute the sequence
        bool success = ISafe(_safeAddr).execTransactionFromModule(
            SEQUENCE_EXECUTOR_ADDR,
            msg.value,
            sequenceData,
            Enum.Operation.DelegateCall
        );
        require(success, Errors.FeeTakeSafeModule_ExecutionFailed());
    }
}
