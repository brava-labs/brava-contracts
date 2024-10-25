// SPDX-License-Identifier: MIT
pragma solidity =0.8.24;

import "./AccessControlDelayed.sol";

contract TestToken {
    bool public value;
    function setValue(bool _value) external {
        value = _value;
    }
}

contract AccessControlDelayedEchidna is AccessControlDelayed {
    TestToken public testToken;
    bytes32 public constant TEST_ROLE = keccak256("TEST_ROLE");

    constructor() AccessControlDelayed(1 days) {
        testToken = new TestToken();
        _grantRole(DEFAULT_ADMIN_ROLE, address(this));
    }

    // Property 1: Roles cannot be granted before delay period
    function echidna_no_instant_grant() public view returns (bool) {
        bytes32 proposalId = keccak256(abi.encodePacked(TEST_ROLE, address(this)));
        return proposedRoles[proposalId] == 0 || block.timestamp < proposedRoles[proposalId];
    }

    // Property 2: Delay cannot exceed 5 days
    function echidna_max_delay() public view returns (bool) {
        return delay <= 5 days;
    }

    // Property 3: Reduced delay must respect lock time
    function echidna_delay_reduction_locked() public view returns (bool) {
        if (proposedDelay == 0) return true;
        if (proposedDelay >= delay) return true;
        return block.timestamp < delayReductionLockTime;
    }

    // Property 4: Role proposal and cancellation
    // function echidna_role_proposal_and_cancellation() public returns (bool) {
    //     bytes32 proposalId = keccak256(abi.encodePacked(TEST_ROLE, address(this)));
    //     _proposeRole(TEST_ROLE, address(this));
    //     bool proposed = proposedRoles[proposalId] != 0;
    //     // cancelRoleProposal(TEST_ROLE, address(this));
    //     bool canceled = proposedRoles[proposalId] == 0;
    //     return proposed && canceled;
    // }

    // Property 5: Role granting after delay
    function echidna_role_granting_after_delay() public returns (bool) {
        bytes32 proposalId = keccak256(abi.encodePacked(TEST_ROLE, address(this)));
        _proposeRole(TEST_ROLE, address(this));
        proposedRoles[proposalId] = block.timestamp; // Simulate delay passing
        try this.grantRole(TEST_ROLE, address(this)) {
            return hasRole(TEST_ROLE, address(this));
        } catch {
            return false;
        }
    }

    // Property 6: Delay change logic
    function echidna_delay_change_logic() public returns (bool) {
        uint256 originalDelay = delay;
        changeDelay(2 days);
        bool increased = delay == 2 days;
        changeDelay(1 days);
        bool reduced = delay == 1 days || proposedDelay == 1 days;
        return increased && reduced;
    }
}
