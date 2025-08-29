# SafeSetupRegistry

`SafeSetupRegistry` holds the canonical Safe configuration used during
deployment by `SafeDeployment`.

## Purpose

- Provide the current set of Safe modules, a guard, and a fallback handler.
- Allow controlled updates to the template used for new Safe deployments.

## Deployment flow

- `SafeDeployment` reads the current `SafeSetupConfig` from the registry.
- The Safe is initialized with:
  - owners `[user]`, threshold `1`
  - `to: SafeSetup`, `data: SafeSetup.setup(modules, guard, fallback)` if any
    configuration is present
  - `fallbackHandler` set to the configured handler

## Operations

- Update the setup via governance to ensure safe rollout.
- Existing Safes are unaffected automatically; opt-in migrations can be handled
  separately if needed.
