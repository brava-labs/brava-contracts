// SPDX-License-Identifier: MIT

pragma solidity =0.8.28;

abstract contract Roles {
    // Role definitions
    // Access to the private keys associated with each address granted roles will be managed off-chain.
    //   And will vary depending on the privilege of the role and future security reviews.

    // OWNER_ROLE is the highest role in the hierarchy, it is used to setup the proposers.
    //   ideally once the proposers are setup this is never used, and is reserved for emergencies only.
    // ADMIN_ROLE is the second highest role in the hierarchy, it is used to assign/manage proposers and executors.
    //   to be used infrequently when team members need to be added or removed.

    // ROLE_ prefix is role management roles
    // FEE_ prefix is fee management roles (no disposer, as we always have a fee config)
    // POOL_ prefix is pool management roles
    // ACTION_ prefix is action management roles

    // *_PROPOSER_ROLE may propose new configurations, this will be behind a multi-sig or similar strong security.
    //   only proposals that have passed an off-chain vetting process should be proposed.
    // *_EXECUTOR_ROLE may execute proposed configurations, this is likely less permissioned than the proposers.
    //   it should be reasonably easy for team members to execute changes once the proposal has passed.
    // *_CANCELER_ROLE may cancel proposals, this role is a defence mechanism and should be treated as relatively in-secure.
    //   it should be possible to cancel a proposal if there was a successful attack and/or the proposal is not
    //   going to be used. This role may be given to bots and/or team members on easy to access software wallets.
    // *_DISPOSER_ROLE may remove pools and actions, this shouldn't be frequently required.
    //   It's likely this role will be given to the same address(es) as the proposers.

    // Lower privileged roles may be assigned to the same address as higher privileged roles.
    //   This means a PROPOSER may also be an EXECUTOR or CANCELER, so they may cancel or execute their own proposals.

    // Master role definitions
    bytes32 public constant OWNER_ROLE = keccak256("OWNER_ROLE");
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    // Granular role definitions
    bytes32 public constant ROLE_PROPOSER_ROLE = keccak256("ROLE_PROPOSER_ROLE");
    bytes32 public constant ROLE_CANCELER_ROLE = keccak256("ROLE_CANCELER_ROLE");
    bytes32 public constant ROLE_EXECUTOR_ROLE = keccak256("ROLE_EXECUTOR_ROLE");
    bytes32 public constant ROLE_DISPOSER_ROLE = keccak256("ROLE_DISPOSER_ROLE");
    bytes32 public constant FEE_PROPOSER_ROLE = keccak256("FEE_PROPOSER_ROLE");
    bytes32 public constant FEE_CANCELER_ROLE = keccak256("FEE_CANCELER_ROLE");
    bytes32 public constant FEE_EXECUTOR_ROLE = keccak256("FEE_EXECUTOR_ROLE");
    bytes32 public constant POOL_PROPOSER_ROLE = keccak256("POOL_PROPOSER_ROLE");
    bytes32 public constant POOL_CANCELER_ROLE = keccak256("POOL_CANCELER_ROLE");
    bytes32 public constant POOL_EXECUTOR_ROLE = keccak256("POOL_EXECUTOR_ROLE");
    bytes32 public constant POOL_DISPOSER_ROLE = keccak256("POOL_DISPOSER_ROLE");
    bytes32 public constant ACTION_PROPOSER_ROLE = keccak256("ACTION_PROPOSER_ROLE");
    bytes32 public constant ACTION_CANCELER_ROLE = keccak256("ACTION_CANCELER_ROLE");
    bytes32 public constant ACTION_EXECUTOR_ROLE = keccak256("ACTION_EXECUTOR_ROLE");
    bytes32 public constant ACTION_DISPOSER_ROLE = keccak256("ACTION_DISPOSER_ROLE");

    // FEE_TAKER_ROLE is the role that can trigger the fee taking mechanism
    bytes32 public constant FEE_TAKER_ROLE = keccak256("FEE_TAKER_ROLE");
}
