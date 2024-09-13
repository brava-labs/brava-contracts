// SPDX-License-Identifier: MIT

pragma solidity =0.8.24;

import "./auth/AdminAuth.sol";
import "./interfaces/IContractRegistry.sol";

/**
 * @title Entry point into executing recipes/checking triggers directly and as part of a strategy
 * @dev RecipeExecutor can be used in two scenarios:
 * 1) Execute a recipe manually through user's wallet by calling executeRecipe()
 *    Here, users can also execute a recipe with a flash loan action. To save on space, the flow will be explained in the next scenario
 *
 *                                                                                                                            ┌────────────────┐
 *                                                                                                                        ┌───┤  1st Action    │
 *                                                                                                                        │   └────────────────┘
 *                                                                                                                        │
 *   Actor                    ┌──────────────┐                      ┌───────────---─────┐                                 │   ┌────────────────┐
 *    ┌─┐                     │              │   Delegate call      │                   │    Delegate call each action    ├───┤  2nd Action    │
 *    └┼┘                     │              │   - executeSequence()│                   │         - executeAction()       │   └────────────────┘
 *  ── │ ──  ─────────────────┤ Safe Wallet  ├──────────────────--──┤ Sequecnce Executor├─────────────────────────────────┤
 *    ┌┴┐                     │              │                      │                   │                                 │    . . .
 *    │ │                     │              │                      │                   │                                 │
 *                            └──────────────┘                      └──────────---──────┘                                 │   ┌────────────────┐
 *                                                                                                                        └───┤  nth Action    │
 *                                                                                                                            └────────────────┘
 *
 *
 */
contract RecipeExecutor is AdminAuth {
    /// @dev List of actions grouped as a sequence
    /// @param name Name of the sequence useful for logging what sequence is executing
    /// @param callData Array of calldata inputs to each action
    /// @param actionIds Array of identifiers for actions - bytes4(keccak256(ActionName))
    /// @param paramMapping Describes how inputs to functions are piped from return/subbed values
    struct Sequence {
        string name;
        bytes[] callData;
        bytes4[] actionIds;
        uint8[][] paramMapping;
    }

    IContractRegistry public immutable contractRegistry;

    /// @dev Function sig of ActionBase.executeAction()
    bytes4 public constant EXECUTE_ACTION_SELECTOR = bytes4(keccak256("executeAction(bytes,uint8[],bytes32[])"));

    constructor(address _adminVault, address _contractRegistry) AdminAuth(_adminVault) {
        contractRegistry = IContractRegistry(_contractRegistry);
    }

    /// @notice Called directly through user wallet to execute a sequence
    /// @dev This is the main entry point for Sequences executed manually
    /// @param _currSequence Sequence to be executed
    function executeSequence(Sequence calldata _currSequence) public payable {
        _executeActions(_currSequence);
    }

    /// @notice Runs all actions from the sequence
    /// @param _currSequence Sequence to be executed
    function _executeActions(Sequence memory _currSequence) internal {
        bytes32[] memory returnValues = new bytes32[](_currSequence.actionIds.length);

        for (uint256 i = 0; i < _currSequence.actionIds.length; ++i) {
            returnValues[i] = _executeAction(_currSequence, i, returnValues);
        }
    }

    /// @notice Gets the action address and executes it
    /// @dev We delegate context of user's wallet to action contract
    /// @param _currSequence Sequence to be executed
    /// @param _index Index of the action in the sequence array
    /// @param _returnValues Return values from previous actions
    function _executeAction(
        Sequence memory _currSequence,
        uint256 _index,
        bytes32[] memory _returnValues
    ) internal returns (bytes32 response) {
        address actionAddr = contractRegistry.getAddr(_currSequence.actionIds[_index]);

        response = delegateCallAndReturnBytes32(
            actionAddr,
            abi.encodeWithSelector(
                EXECUTE_ACTION_SELECTOR,
                _currSequence.callData[_index],
                _currSequence.paramMapping[_index],
                _returnValues
            )
        );
    }

    function delegateCallAndReturnBytes32(address _target, bytes memory _data) internal returns (bytes32 response) {
        require(_target != address(0));

        // call contract in current context
        assembly {
            let succeeded := delegatecall(sub(gas(), 5000), _target, add(_data, 0x20), mload(_data), 0, 32)

            // load delegatecall output
            response := mload(0)

            // throw if delegatecall failed
            if eq(succeeded, 0) {
                revert(0, 0)
            }
        }
    }
}
