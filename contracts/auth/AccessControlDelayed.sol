// SPDX-License-Identifier: MIT

pragma solidity =0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Errors} from "../Errors.sol";

/// @title Add delays to granting roles in access control
abstract contract AccessControlDelayed is AccessControl {

    event RoleProposed(bytes32 indexed role, address indexed account, uint256 delay);
    event RoleProposalCancelled(bytes32 indexed role, address indexed account);

    event DelayChanged(uint256 oldDelay, uint256 newDelay);

    uint256 public delay; // How long after a proposal can the role be granted
    uint256 public proposedDelay; // New delay to be set after delayReductionLockTime
    uint256 public delayReductionLockTime; // Time when the new delay can be set/used
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
            revert Errors.AdminVault_NotProposed();
        }
        // Check if delay is passed
        if (block.timestamp < proposedRoles[proposalId]) {
            revert Errors.AdminVault_DelayNotPassed(block.timestamp, proposedRoles[proposalId]);
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
        if (account == address(0)) {
            revert Errors.InvalidInput("AccessControlDelayed", "_proposeRole");
        }
        // Check if role was already proposed
        bytes32 proposalId = keccak256(abi.encodePacked(role, account));
        if (proposedRoles[proposalId] > 0) {
            revert Errors.AdminVault_AlreadyProposed();
        }
        // add to list of proposed roles with the wait time
        proposedRoles[proposalId] = _getDelayTimestamp();
        emit RoleProposed(role, account, proposedRoles[proposalId]);
    }

    // A helper to find the time when a role proposal will be available to grant
    function getRoleProposalTime(bytes32 role, address account) public view returns (uint256) {
        return proposedRoles[keccak256(abi.encodePacked(role, account))];
    }

    // Admin function to change the delay
    // If the new delay is longer we just use it.
    // If the new delay is shorter we must set a timestamp for when the old delay
    // would have expired and we can use the new delay after that time.
    // e.g. If the delay is 2 hours, and we reduce it to 1 hour. All new proposals
    //      must wait until at least now + 2 hours (old delay) but in 1 hour's time
    //      they may start using the new delay (because both the old and the new
    //      delays will have passed by the time they may be granted).
    // Note: We don't simply add the shorter delay to the delayReductionLockTime
    //       because for legitimate use we may want to shorten the delay, say from
    //       2 days to 1 day, in this case we don't want to wait a total of 3 days.
    // This means that the delay used by default should include enough time to:
    //   -- Notice the change
    //   -- Deal with the security hole (remove attackers permissions)
    //   -- Adjust the delay back to a suitable value
    //   -- Cancel any proposals made during this period
    function changeDelay(uint256 _newDelay) public onlyRole(DEFAULT_ADMIN_ROLE) {
        // Only overwrite the same delay if there is a proposal we want to cancel
        // Delay must not more than 5 days (to avoid costly mistakes)
        if ((_newDelay == delay && proposedDelay != 0) || _newDelay > 5 days) {
            revert Errors.AccessControlDelayed_InvalidDelay();
        }

        if (block.timestamp < delayReductionLockTime) {
            // The delay must already have been reduced because delayReductionLockTime is in the future
            // We can't have set the delay to proposedDelay yet, so we can just delete it
            delete delayReductionLockTime;
            delete proposedDelay;
        }
        emit DelayChanged(delay, _newDelay);
        if (_newDelay >= delay) {
            // New delay is longer, just set it
            delay = _newDelay;
        } else {
            // New delay is shorter, enforce old delay until it is met
            delayReductionLockTime = block.timestamp + delay;
            proposedDelay = _newDelay;
        }
    }

    // an internal function that will return the timestamp to wait until,
    // foctors in the the delayReuctionLockTime
    // if after the lock time we can set delay to the new value
    function _getDelayTimestamp() internal returns (uint256) {
        if (block.timestamp < delayReductionLockTime) {
            // We haven't reached the lock time yet,
            // We must wait until the greater of the lock time, or now + proposedDelay
            uint256 proposedDelayTime = block.timestamp + proposedDelay;
            return proposedDelayTime > delayReductionLockTime ? proposedDelayTime : delayReductionLockTime;
        }
        // We have reached the lock time, we may set the delay to the proposed delay
        if (proposedDelay != 0) {
            delay = proposedDelay;
            delete proposedDelay;
        }
        return block.timestamp + delay;
    }

    function _checkProposalWaitTime(bytes32 proposalId) internal view returns (bool) {
        return block.timestamp >= proposedRoles[proposalId];
    }

    function cancelRoleProposal(bytes32 role, address account) external virtual onlyRole(DEFAULT_ADMIN_ROLE) {
        if (proposedRoles[keccak256(abi.encodePacked(role, account))] == 0) {
            revert Errors.AdminVault_NotProposed();
        }
        delete proposedRoles[keccak256(abi.encodePacked(role, account))];
        emit RoleProposalCancelled(role, account);
    }
}
