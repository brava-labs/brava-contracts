# Deterministic Proxy Deployment (CreateX)

This guide describes deploying OpenZeppelin proxies at deterministic addresses
using CreateX and upgrading them post-deployment. It targets deployment scripts
in `packages/contracts/scripts/deployments`.

## Summary

- Uses TransparentUpgradeableProxy bytecode deployed via CreateX (same CreateX
  at `0xba5Ed099...` across many chains) to achieve deterministic proxy
  addresses.
- Sets the initial implementation/admin to known addresses to satisfy OZ
  constraints, then upgrades to the real implementation via `ProxyAdmin`.
- Scripts: see `scripts/deployments/deploy-proxy.ts` and related helpers.

## Steps

1. Compute proxy address using CreateX guarded salt + init code hash.
2. Deploy proxy via CreateX (CREATE2).
3. Upgrade proxy to the target implementation (optionally with init call).
4. Verify storage slots `_IMPLEMENTATION_SLOT` and `_ADMIN_SLOT` when needed.

## Notes

- This is infrastructure guidance for deployment tooling, not the runtime
  protocol architecture.
- Keep salts descriptive and versioned.
- Salt guarding (CreateX): the factory guards the input salt. Without sender/cross-chain guards, it computes:
  - rawSalt = keccak256(abi.encodePacked(label))
  - guardedSalt = keccak256(abi.encode(rawSalt))
  Use guardedSalt in the CREATE2 formula or CreateX compute calls.
- Guards we avoid to keep cross-chain determinism:
  - Sender guard (first 20 bytes = msg.sender)
  - Cross-chain flag (byte 21 = 0x01)
- Admin selection: during deployment we set admin to deployer for now. For production, set admin to a Safe.
- Prefer testnets and forks before mainnet.
