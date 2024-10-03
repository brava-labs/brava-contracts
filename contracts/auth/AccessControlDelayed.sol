// SPDX-License-Identifier: MIT

pragma solidity =0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @title Add delays to granting roles in access control
abstract contract AccessControlDelayed is AccessControl {
    error RoleAlreadyProposed();
    error RoleNotProposed();
    error DelayNotPassed();
    error InvalidDelay();
    uint256 public delay;
    uint256 public delayReductionLockTime;
    // mapping of proposed roles to the timestamp they can be granted
    mapping(bytes32 => uint256) public proposedRoles;

    constructor(uint256 _delay) {
        delay = _delay;
    }

    function grantRoles(bytes32[] calldata roles, address[] calldata accounts) external virtual {
        for (uint256 i = 0; i < roles.length; i++) {
            grantRole(roles[i], accounts[i]);
        }
    }

    function grantRole(bytes32 role, address account) public virtual override(AccessControl) {
        bytes32 proposalId = keccak256(abi.encodePacked(role, account));
        // Check if role was proposed
        if (proposedRoles[proposalId] == 0) {
            revert RoleNotProposed();
        }
        // Check if delay is passed
        if (block.timestamp < proposedRoles[proposalId]) {
            revert DelayNotPassed();
        }
        // role was proposed and delay has passed, delete proposal and grant role
        delete proposedRoles[proposalId];
        super.grantRole(role, account);
    }

    function proposeRoles(
        bytes32[] calldata roles,
        address[] calldata accounts
    ) external virtual onlyRole(DEFAULT_ADMIN_ROLE) {
        for (uint256 i = 0; i < roles.length; i++) {
            _proposeRole(roles[i], accounts[i]);
        }
    }

    function proposeRole(bytes32 role, address account) external virtual onlyRole(DEFAULT_ADMIN_ROLE) {
        _proposeRole(role, account);
    }

    function _proposeRole(bytes32 role, address account) internal virtual {
        // Check if role was already proposed
        bytes32 proposalId = keccak256(abi.encodePacked(role, account));
        if (proposedRoles[proposalId] > 0) {
            revert RoleAlreadyProposed();
        }
        uint256 additionalDelay = 0;
        // Check if delay reduction lock time is passed
        if (block.timestamp < delayReductionLockTime) {
            // lock time is not passed, add additional delay
            additionalDelay = delayReductionLockTime - block.timestamp;
        }
        // add to list of proposed roles using block.timestamp + delay + additionalDelay(if any)
        proposedRoles[proposalId] = block.timestamp + delay + additionalDelay;
    }

    // A helper to find the time when a role proposal will be available to grant
    function getProposalTime(bytes32 role, address account) public view returns (uint256) {
        return proposedRoles[keccak256(abi.encodePacked(role, account))];
    }

    function changeDelay(uint256 newDelay) public onlyRole(DEFAULT_ADMIN_ROLE) {
        // delay must be different and not more than 5 days (to avoid costly mistakes)
        if (newDelay == delay || newDelay > 5 days) {
            revert InvalidDelay();
        }
        if (newDelay > delay) {
            // new delay is longer, just set it
            delay = newDelay;
        } else {
            // new delay is shorter, enforce old delay until it is met
            delay = newDelay;
            uint256 timeDelta = delay - newDelay;
            // set delay reduction lock time to current time + timeDelta
            // this is the timestamp when we can use the new delay
            delayReductionLockTime = block.timestamp + timeDelta;
        }
    }
}
