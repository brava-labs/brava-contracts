// SPDX-License-Identifier: MIT

pragma solidity =0.8.24;

import {AccessControlDefaultAdminRules} from "@openzeppelin/contracts/access/extensions/AccessControlDefaultAdminRules.sol";

/// @title A stateful contract that holds some global variables, and permission management.
contract AdminVault is AccessControlDefaultAdminRules {
    error SenderNotAdmin();
    error SenderNotOwner();
    error FeePercentageOutOfRange();
    error InvalidRange();
    error InvalidRecipient();
    error ActionNotFound();
    error ActionAlreadyAdded();
    error ProtocolNotFound();
    error ProtocolAlreadyAdded();
    error VaultNotFound();
    error VaultAlreadyAdded();
    error SenderNotAction();

    bytes32 public constant ACTION_ADMIN_ROLE = keccak256("ACTION_ADMIN_ROLE");

    uint256 public minFeeBasis;
    uint256 public maxFeeBasis;
    address public feeRecipient;
    // mapping of when a particular safe had fees taken from a particular vault
    mapping(address => mapping(address => uint256)) public lastFeeTimestamp;

    // as each protocol may have multiple action contracts, we need to relate them to eachother
    // this ensures when we add a vault, it is added to all the action contracts of the protocol
    /// @dev This is not gas efficient to set and maintain, it's all about the user operations.
    struct Protocol {
        string name; // name of the protocol
        bool enabled; // allows us to disable a protocol without removing it from the registry
        address[] actionContracts; // action addresses that are allowed to be used with this protocol
        address[] vaults; // vault addresses that are allowed to be used with this protocol
    }
    Protocol[] public protocols; // protocolId => protocol
    mapping(string => uint256) public protocolNameToId; // protocol name => protocolId
    mapping(address => uint256) public actionToProtocolId; // action address => protocolId

    // All that was admin to maintain this mapping, this is what is frequently by action contracts.
    mapping(address => mapping(address => bool)) public allowedVault; // action address => vault address => is allowed

    /// TODO: Should we add events for all the setters?
    constructor(address _initialOwner, uint48 _roleDelay) AccessControlDefaultAdminRules(_roleDelay, _initialOwner) {
        // putting some default values here
        minFeeBasis = 0;
        maxFeeBasis = 10000; // 100%
        feeRecipient = _initialOwner;
        _grantRole(ACTION_ADMIN_ROLE, _initialOwner);

        // burn the first protocol so none have the zero index
        addProtocol("burn");
    }

    modifier isProtocolName(string memory _name) {
        if (protocolNameToId[_name] == 0) {
            revert ProtocolNotFound();
        }
        _;
    }

    function setFeeRange(uint256 _min, uint256 _max) external onlyRole(DEFAULT_ADMIN_ROLE) {
        minFeeBasis = _min;
        maxFeeBasis = _max;
    }

    function setFeeRecipient(address _recipient) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (_recipient == address(0)) {
            revert InvalidRecipient();
        }
        feeRecipient = _recipient;
    }

    // called by an action when a user changes their deposit from zero to non-zero
    // TODO: Add a guard to block attackers from calling this, given access to a mapping they can write to storage of their choice
    function initializeFeeTimestamp(address _vault) external {
        // check the sender is an action contract

        // TODO: Enable this check once the tests are updated, currenlty nothing is added to the vault
        // if (actionToProtocolId[msg.sender] == 0) {
        //     revert SenderNotAction();
        // }
        lastFeeTimestamp[msg.sender][_vault] = block.timestamp;
    }

    // called by the safe when a fee is taken
    function updateFeeTimestamp(address _vault) external {
        assert(lastFeeTimestamp[msg.sender][_vault] != 0);
        lastFeeTimestamp[msg.sender][_vault] = block.timestamp;
    }

    // View functions

    function getLastFeeTimestamp(address _vault) external view returns (uint256) {
        assert(lastFeeTimestamp[msg.sender][_vault] != 0);
        return lastFeeTimestamp[msg.sender][_vault];
    }

    function checkFeeBasis(uint256 _feeBasis) external view {
        if (_feeBasis < minFeeBasis || _feeBasis > maxFeeBasis) {
            revert FeePercentageOutOfRange();
        }
    }

    function checkVaultAllowed(address _vault) external view returns (bool) {
        return allowedVault[msg.sender][_vault];
    }

    function getVaults(address _action) external view returns (address[] memory) {
        return protocols[actionToProtocolId[_action]].vaults;
    }

    // Simply implements a protocol name, actions and vaults should be added seperately
    function addProtocol(string memory _name) public onlyRole(ACTION_ADMIN_ROLE) {
        if (protocolNameToId[_name] != 0) {
            revert ProtocolAlreadyAdded();
        }
        protocolNameToId[_name] = protocols.length;
        protocols.push(Protocol(_name, false, new address[](0), new address[](0)));
    }

    // The action contract should be added to the protocol
    // any vaults already whitelisted should be added to this new action
    function addAction(
        string memory _name,
        address _action
    ) external onlyRole(ACTION_ADMIN_ROLE) isProtocolName(_name) {
        uint256 _protocolId = protocolNameToId[_name];
        // Check if the action is already added to a protocol
        if (actionToProtocolId[_action] != 0) {
            revert ActionAlreadyAdded();
        }
        // Add the action to the protocol
        protocols[_protocolId].actionContracts.push(_action);
        // update the helper so we can check which protocol this action belongs to
        actionToProtocolId[_action] = _protocolId;
        // add the vaults that are allowed to use this action
        for (uint256 i = 0; i < protocols[_protocolId].vaults.length; i++) {
            allowedVault[_action][protocols[_protocolId].vaults[i]] = true;
        }
    }

    function removeAction(
        string memory _name,
        address _action
    ) external onlyRole(ACTION_ADMIN_ROLE) isProtocolName(_name) {
        uint256 _protocolId = protocolNameToId[_name];
        if (actionToProtocolId[_action] == 0) {
            revert ActionNotFound();
        }
        Protocol storage protocol = protocols[_protocolId];
        // remove the action from the protocol
        for (uint256 i = 0; i < protocol.actionContracts.length; i++) {
            if (protocol.actionContracts[i] == _action) {
                protocol.actionContracts[i] = protocol.actionContracts[protocol.actionContracts.length - 1];
                protocol.actionContracts.pop();
                actionToProtocolId[_action] = 0;
                break;
            }
        }
        // remove the vaults that this action was allowed to use
        for (uint256 i = 0; i < protocol.vaults.length; i++) {
            allowedVault[_action][protocol.vaults[i]] = false;
        }
        // remove the action from the actionToProtocolId mapping
        delete actionToProtocolId[_action];
    }

    function enableProtocol(string memory _protocol) external onlyRole(ACTION_ADMIN_ROLE) isProtocolName(_protocol) {
        uint256 _protocolId = protocolNameToId[_protocol];
        protocols[_protocolId].enabled = true;
    }

    function disableProtocol(string memory _protocol) external onlyRole(ACTION_ADMIN_ROLE) isProtocolName(_protocol) {
        uint256 _protocolId = protocolNameToId[_protocol];
        protocols[_protocolId].enabled = false;
    }

    function addVault(
        string memory _protocol,
        address _vault
    ) external onlyRole(ACTION_ADMIN_ROLE) isProtocolName(_protocol) {
        uint256 _protocolId = protocolNameToId[_protocol];
        // check the vault is not already added to this protocol
        for (uint256 i = 0; i < protocols[_protocolId].vaults.length; i++) {
            if (protocols[_protocolId].vaults[i] == _vault) {
                revert VaultAlreadyAdded();
            }
        }
        // add the vault to the protocol
        protocols[_protocolId].vaults.push(_vault);
        // for each action contract in the protocol, add the vault to the allowedVault mapping
        for (uint256 i = 0; i < protocols[_protocolId].actionContracts.length; i++) {
            allowedVault[protocols[_protocolId].actionContracts[i]][_vault] = true;
        }
    }

    function removeVault(
        string memory _protocol,
        address _vault
    ) external onlyRole(ACTION_ADMIN_ROLE) isProtocolName(_protocol) {
        uint256 _protocolId = protocolNameToId[_protocol];
        // for each action contract in the protocol, remove the vault from the allowedVault mapping
        for (uint256 i = 0; i < protocols[_protocolId].actionContracts.length; i++) {
            allowedVault[protocols[_protocolId].actionContracts[i]][_vault] = false;
        }
        // remove the vault from the protocol
        for (uint256 i = 0; i < protocols[_protocolId].vaults.length; i++) {
            if (protocols[_protocolId].vaults[i] == _vault) {
                protocols[_protocolId].vaults[i] = protocols[_protocolId].vaults[
                    protocols[_protocolId].vaults.length - 1
                ];
                protocols[_protocolId].vaults.pop();
                return;
            }
        }
        revert VaultNotFound();
    }

    function getActionContracts(uint256 _protocolId) external view returns (address[] memory) {
        return protocols[_protocolId].actionContracts;
    }
}
