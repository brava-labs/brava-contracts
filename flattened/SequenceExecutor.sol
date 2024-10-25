// Sources flattened with hardhat v2.22.10 https://hardhat.org

// SPDX-License-Identifier: MIT

// File contracts/interfaces/IAdminVault.sol

// Original license: SPDX_License_Identifier: MIT
pragma solidity ^0.8.24;

interface IAdminVault {
    // Errors
    error SenderNotAdmin();
    error SenderNotOwner();
    error FeeTimestampNotInitialized();
    error FeeTimestampAlreadyInitialized();
    error FeePercentageOutOfRange();
    error InvalidRange();
    error InvalidRecipient();
    error AccessControlUnauthorizedAccount(address account, bytes32 neededRole);
    error AccessControlBadConfirmation();

    // Structs
    struct FeeConfig {
        address recipient;
        uint256 minBasis;
        uint256 maxBasis;
        uint256 proposalTime;
    }

    // View Functions
    // solhint-disable-next-line func-name-mixedcase
    function LOGGER() external view returns (address);
    // solhint-disable-next-line func-name-mixedcase
    function OWNER_ROLE() external view returns (bytes32);
    // solhint-disable-next-line func-name-mixedcase
    function ADMIN_ROLE() external view returns (bytes32);
    function feeConfig() external view returns (FeeConfig memory);
    function pendingFeeConfig() external view returns (FeeConfig memory);
    function lastFeeTimestamp(address, address) external view returns (uint256);
    function protocolPools(uint256 protocolId, bytes4 poolId) external view returns (address);
    function actionAddresses(bytes4 actionId) external view returns (address);
    function getPoolAddress(string calldata _protocolName, bytes4 _poolId) external view returns (address);
    function getActionAddress(bytes4 _actionId) external view returns (address);
    function getLastFeeTimestamp(address _vault) external view returns (uint256);
    function checkFeeBasis(uint256 _feeBasis) external view;
    function getPoolProposalTime(string calldata protocolName, address poolAddress) external view returns (uint256);
    function getActionProposalTime(bytes4 actionId, address actionAddress) external view returns (uint256);

    // Role Management Functions
    function hasRole(bytes32 role, address account) external view returns (bool);
    function getRoleAdmin(bytes32 role) external view returns (bytes32);
    function grantRole(bytes32 role, address account) external;
    function revokeRole(bytes32 role, address account) external;
    function renounceRole(bytes32 role, address callerConfirmation) external;

    // Fee Management Functions
    function proposeFeeConfig(address recipient, uint256 min, uint256 max) external;
    function cancelFeeConfigProposal() external;
    function setFeeConfig() external;
    function initializeFeeTimestamp(address _vault) external;
    function updateFeeTimestamp(address _vault) external;

    // Pool Management Functions
    function proposePool(string calldata protocolName, address poolAddress) external;
    function cancelPoolProposal(string calldata protocolName, address poolAddress) external;
    function addPool(string calldata protocolName, address poolAddress) external;
    function removePool(string calldata protocolName, address poolAddress) external;

    // Action Management Functions
    function proposeAction(bytes4 actionId, address actionAddress) external;
    function cancelActionProposal(bytes4 actionId, address actionAddress) external;
    function addAction(bytes4 actionId, address actionAddress) external;
    function removeAction(bytes4 actionId) external;
}


// File contracts/SequenceExecutor.sol

// Original license: SPDX_License_Identifier: MIT

pragma solidity =0.8.24;

/**
 * @title Entry point into executing Sequences
 *
 *                                                                                                                            ┌────────────────┐
 *                                                                                                                        ┌───┤  1st Action    │
 *                                                                                                                        │   └────────────────┘
 *                                                                                                                        │
 *   Actor                    ┌──────────────┐                      ┌───────────---─────┐                                 │   ┌────────────────┐
 *    ┌─┐                     │              │   Delegate call      │                   │    Delegate call each action    ├───┤  2nd Action    │
 *    └┼┘                     │              │   - executeSequence()│                   │         - executeAction()       │   └────────────────┘
 *  ── │ ──  ─────────────────┤ Safe Wallet  ├──────────────────--──┤  Sequence Executor├─────────────────────────────────┤
 *    ┌┴┐                     │              │                      │                   │                                 │    . . .
 *    │ │                     │              │                      │                   │                                 │
 *                            └──────────────┘                      └──────────---──────┘                                 │   ┌────────────────┐
 *                                                                                                                        └───┤  nth Action    │
 *                                                                                                                            └────────────────┘
 *
 *
 */
contract SequenceExecutor {
    /// @dev List of actions grouped as a sequence
    /// @param name Name of the sequence useful for logging what sequence is executing
    /// @param callData Array of calldata inputs to each action
    /// @param actionIds Array of identifiers for actions - bytes4(keccak256(ActionName))
    struct Sequence {
        string name;
        bytes[] callData;
        bytes4[] actionIds;
    }

    IAdminVault public immutable ADMIN_VAULT;

    error NoActionAddressGiven();

    constructor(address _adminVault) {
        ADMIN_VAULT = IAdminVault(_adminVault);
    }

    /// @notice Called directly through user wallet to execute a sequence
    /// @dev This is the main entry point for Sequences executed manually
    /// @param _currSequence Sequence to be executed
    function executeSequence(Sequence calldata _currSequence) public payable virtual {
        _executeActions(_currSequence);
    }

    /// @notice Runs all actions from the sequence
    /// @param _currSequence Sequence to be executed
    function _executeActions(Sequence memory _currSequence) internal {
        for (uint256 i = 0; i < _currSequence.actionIds.length; ++i) {
            _executeAction(_currSequence, i);
        }
    }

    /// @notice Gets the action address and executes it
    /// @dev We delegate context of user's wallet to action contract
    /// @param _currSequence Sequence to be executed
    /// @param _index Index of the action in the sequence array
    function _executeAction(Sequence memory _currSequence, uint256 _index) internal virtual {
        address actionAddr = ADMIN_VAULT.getActionAddress(_currSequence.actionIds[_index]);
        delegateCall(actionAddr, _currSequence.callData[_index]);
    }

    function delegateCall(address _target, bytes memory _data) internal {
        if (_target == address(0)) {
            revert NoActionAddressGiven();
        }
        // call contract in current context
        // solhint-disable-next-line no-inline-assembly
        assembly {
            let succeeded := delegatecall(sub(gas(), 5000), _target, add(_data, 0x20), mload(_data), 0, 0)

            // throw if delegatecall failed
            if eq(succeeded, 0) {
                revert(0, 0)
            }
        }
    }
}
