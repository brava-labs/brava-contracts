# Safe Deployment

`SafeDeployment` creates single-owner Safes deterministically using EIP-1167
minimal proxies and a centralized `SafeSetupRegistry` configuration.

## Behavior

- Predict addresses with `predictSafeAddress(user)` using `CREATE2` over the
  EIP-1167 proxy bytecode and the user’s address as salt.
- Check existence with `isSafeDeployed(user)`.
- Deploy with `deploySafe(user)`; emits `SafeDeployed(user, safeAddress)` and
  logs via `Logger`.
- Initialize Safes with owners `[user]`, threshold `1`, and configuration
  returned by `SafeSetupRegistry` (modules, guard, fallback handler) in a single
  atomic `Safe.setup` call. The `fallbackHandler` is set via `SafeSetup.setup`
  (the `Safe.setup` parameter is set to `address(0)` to avoid duplicate writes).

## API

```solidity
function predictSafeAddress(address user) external view returns (address);
function isSafeDeployed(address user) external view returns (bool);
function deploySafe(address user) external returns (address);
```

## Initialization

```solidity
function initialize(
  address adminVault,
  address logger,
  address safeSingleton,
  address safeSetup,
  address setupRegistry
) external initializer;
```

- `safeSingleton`: Safe implementation address.
- `safeSetup`: contract that enables and configures modules/guard/fallback on
  the Safe.
- `setupRegistry`: source of the current `SafeSetupConfig` used during
  deployment.

## Determinism

- Address is derived from
  `(deployer=this, salt=keccak256(user), initCodeHash=minimal-proxy(safeSingleton))`.
- Users receive the same Safe address on every chain where the same
  `SafeDeployment` and `safeSingleton` are deployed.

## Usage with EIP-712 Module

- When `deploySafe` is true in a sequence, the EIP-712 module validates the
  provided `safe` matches `predictSafeAddress(signer)` and deploys if missing.

## Notes

- Threshold is fixed at 1 (single owner). Multi-owner support would require an
  extended setup path.
- The contract is `Initializable` and upgradeable-safe (storage gap present).
