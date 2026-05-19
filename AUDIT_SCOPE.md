# Audit Scope -- Cosigner Update

Breakdown of contract changes since the last Sigma Prime audits, for scoping and quotation.

Previous audits:
- [Core Protocol Audit](https://github.com/sigp/public-audits/blob/master/reports/brava/report.pdf)
- [Module Integrations Add-on](https://github.com/sigp/public-audits/blob/master/reports/brava/module-integrations/report.pdf)

All SLOC counts are non-blank, non-comment lines. The baseline is `main` (the state covered by the Sigma Prime audits).

---

## Tier 1: Core Auth System (~642 SLOC)

The EIP-712 execution module was fully audited by Sigma Prime. The core execution flow, gas refund mechanism, and Safe integration are unchanged. On top of the audited module we've added co-signer and manager authentication -- roughly 136 SLOC of changes within the module itself, plus a new AuthRegistry contract (~411 SLOC) that manages auth state externally so it survives module upgrades.

The module now recovers multiple packed signatures, classifies each signer (owner / manager / co-signer) against the registry, verifies co-signing thresholds for manager bundles, and supports owner-driven auth config propagation across chains via CCTP. The AuthRegistry stores managers, co-signers, and thresholds per Safe with caps of 10 managers and 10 co-signers.

Managers can also be scoped to specific action types -- the registry stores per-manager allowed action restrictions and the module enforces them during sequence execution, with validation that restrictions reference only valid action types registered in AdminVault. If a manager has no explicit restrictions, all action types are permitted.

| Contract | Previously Audited | Current SLOC | Net New SLOC | Description |
|----------|-------------------|-------------|-------------|-------------|
| EIP712TypedDataSafeModule | Yes (390 SLOC) | 526 | +136 | Multi-sig recovery, signer classification, threshold checks, auth update application, manager scope enforcement |
| AuthRegistry | No | 411 | +411 | Per-chain manager/co-signer/threshold store, per-manager action type restrictions with validation, stale bitmap clearing, cross-chain CCTP propagation |
| EIP712TypedDataLib | Yes (84 SLOC) | 122 | +38 | AuthUpdate and ManagerScope type hashing for new bundle fields |
| EmergencyWithdrawModule | No | 57 | +57 | AdminVault-independent Safe withdrawal path for owners |

---

## Tier 2: New Protocol Integrations (~314 SLOC)

New protocol actions following the same audited ActionBase patterns used across all existing integrations. Morpho Vault V2 is two thin ERC4626 wrappers (~25 SLOC combined). Morpho Markets (Blue) is the only substantive new integration. AssignToken is a utility action for held-token position tracking.

| Contract | SLOC | Description |
|----------|------|-------------|
| MorphoMarketsSupply | 108 | Morpho Blue direct market supply |
| MorphoMarketsWithdraw | 127 | Morpho Blue direct market withdraw |
| MorphoVaultV2Supply | 11 | Thin ERC4626Supply wrapper |
| MorphoVaultV2Withdraw | 14 | Thin ERC4626Withdraw wrapper |
| AssignToken | 54 | Utility action to mark held-token positions in registry |

---

## Tier 3: Supporting Changes (~232 SLOC)

Error declarations, a module lookup helper, CCTP bridge extensions for auth propagation, and interface definitions. None of these contain complex logic -- interfaces are purely declarative, errors are definitions only, and the lookup helper is a simple iteration over Safe modules.

| Contract | SLOC | Net New | Description |
|----------|------|---------|-------------|
| CCTPBridgeSend | 180 | +56 | Auth propagation hook data in CCTP V2 messages |
| BravaModuleLookup | 50 | +50 | Helper to find the Brava module enabled on a Safe |
| Errors.sol | 115 | +32 | New error definitions for AuthRegistry, multi-sig, module lookup, manager scope validation |
| IMorphoBlue | 42 | +42 | Third-party Morpho interface (not custom logic) |
| IAuthRegistry | 35 | +35 | Interface for AuthRegistry |
| IEip712TypedDataSafeModule | 46 | +1 | AuthUpdate and ManagerScope structs added to Bundle type |
| IBravaSafeModule | 9 | +9 | ERC-165 interface ID for module detection |
| IEmergencyWithdrawModule | 7 | +7 | Interface for emergency module |

---

## Unchanged (previously audited, zero diff)

These contracts are fully covered by the existing Sigma Prime audits and have no changes:

AdminVault (226), AccessControlDelayed (108), SequenceExecutor (92), TokenRegistry (67), SafeSetupRegistry (60), BravaGuard (49), SafeSetup (26), Roles (21), Logger (17), SafeDeployment (147), Proxy (2), and all existing protocol actions (Aave V3, Euler V2, Fluid V1, Spark V1, Yearn V2/V3, Vesper V1, Gearbox V3, Maple V1, Morpho V1, Curve Savings, Across V3, Nexus Mutual, Sky V1, CompoundV2, ERC4626, swaps).

---

## Summary

| Tier | Description | Net New SLOC |
|------|-------------|-------------|
| 1 | Core auth (EIP712 module + AuthRegistry + library + emergency module) | ~642 |
| 2 | New protocol integrations | ~314 |
| 3 | Supporting changes (CCTP, errors, helpers, interfaces) | ~232 |
| **Total** | | **~1,188** |
