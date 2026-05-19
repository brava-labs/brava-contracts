# CCTP Receive Flow (Implementation Notes)

CCTP burns USDC on a source chain and mints the equivalent on a destination
chain after Circle attestation. This document captures the parameters and
on-chain entrypoints needed to build a receive action.

## Domains (Circle)

- Ethereum: 0
- Avalanche: 1
- OP Mainnet: 2
- Arbitrum: 3
- Base: 6
- Polygon PoS: 7
- Unichain: 10
- Linea: 11

## Source Bridge Action (Summary)

Required parameters for the burn step:

```json
{
  "token": "<USDC on source chain>",
  "amount": "<uint256, token decimals>",
  "destinationDomain": <domain>,
  "destinationCaller": "<address authorized to call receiveMessage>",
  "recipient": "<address receiving minted USDC>",
  "nonce": <uint64 unique>
}
```

- `destinationCaller` must be the contract/address that will submit the receive
  on destination chain.
- `recipient` is where minted USDC is delivered.

## Attestation

Query Iris API for the message and attestation using the source chain domain and
the bridge transaction hash. Only proceed when status is `complete`.

```bash
curl "https://iris-api.circle.com/v2/messages/{sourceDomain}?transactionHash={txHash}"
```

## Destination Receive (v2 hooks)

- Use `MessageTransmitter.receiveMessage(bytes message, bytes attestation)` on
  the destination chain. Circle mints USDC to the encoded `mintRecipient`.
- The CCTP message embeds `destinationCaller` (an address). Only that address
  is authorized by Circle to successfully call `receiveMessage` for the message.
- `hookData` is embedded in the CCTP V2 message. Circle does not call any hook;
  the destination relayer interprets and acts on it.
- Brava uses two `hookData` envelopes selected by the leading version byte:
  - **Bundle envelope (no version byte)** — `[20-byte target][raw calldata]`.
    Used by the non-auth path on `CCTPBundleReceiver`. The target is informational
    only in the new flow — the receiver discovers the destination Safe's Brava
    module via ERC-165 (see "Module Discovery" below).
  - **Auth envelope (`hookVersion = 1`)** —
    `abi.encode(uint8(1), abi.encode(safe, version, managers[], coSigners[], ownerCoSignThreshold, managerCoSignThreshold))`.
    Decoded by `AuthRegistry` to apply a full auth config snapshot.
- Contract addresses (CCTP v2) are chain-constant:
  - `MessageTransmitter`: `0x81D40F21F12A8F0E3252Bccb954D722d4c464B64`
  - `TokenMessenger`: `0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d`
  - `TokenMinter`: `0xfd78EE919681417d192449715b2594ab58f5D002`

## Brava Integration

There are two destination entry points, picked at *send* time via
`destinationCaller`:

### Non-auth path — `CCTPBundleReceiver`

- Source: `CCTPBridgeSend` with `propagateAuth = false`. Caller supplies
  `destinationCaller = address(CCTPBundleReceiver)`.
- Destination: anyone calls `CCTPBundleReceiver.relay(message, attestation)`
  (mint only) or `CCTPBundleReceiver.relayWithBundle(message, attestation, safe,
  bundle, signature)` (mint + best-effort `executeBundle` against the Brava
  module discovered via ERC-165 on the Safe).
- Permissionless. Bundle execution is best-effort and decoupled from the mint
  outcome only when the bundle is supplied separately.

### Auth-aware path — `AuthRegistry`

- Source: `CCTPBridgeSend` with `propagateAuth = true`. The action ignores
  caller-supplied `destinationCaller` and forces it to
  `address(AUTH_REGISTRY)` (CreateX-derived constant — same address on every
  chain). It reads `(version, managers[], coSigners[], ownerCoSignThreshold,
  managerCoSignThreshold)` from the source-chain registry for the Safe under
  delegatecall and encodes the auth envelope into `hookData`.
- Destination: anyone calls
  `AuthRegistry.relayCCTPAndExecute(message, attestation, safe, bundle, signature)`,
  which:
  1. Validates `_safe` matches the CCTP message's `mintRecipient`.
  2. Calls `MessageTransmitter.receiveMessage` (mints USDC; whole tx reverts on
     failure).
  3. If `hookData` carries `hookVersion = 1`, enforces the triple-check
     (`burnSender == hookData.safe == mintRecipient`) and applies the
     snapshot.
  4. Discovers the Safe's Brava module via `BravaModuleLookup` and best-effort
     forwards `executeBundle(safe, bundle, signature)`.
- For auth-only updates without a bundle, callers can use
  `AuthRegistry.receiveCCTPAuthUpdate(message, attestation)`.

### Module Discovery (shared)

Both relay contracts use `BravaModuleLookup.findEnabledBravaModule(ISafe)`:

- Iterates the first page (capped at 10) of `getModulesPaginated`.
- Calls `supportsInterface(type(IBravaSafeModule).interfaceId)` on each, with
  `try/catch` around modules that are not ERC-165.
- Returns the unique match. Reverts on zero matches
  (`NoBravaModuleEnabled`) or more than one match (`MultipleBravaModules`).

`EIP712TypedDataSafeModule` inherits OpenZeppelin's `ERC165` and registers the
`IBravaSafeModule` marker — so module upgrades that keep the `executeBundle`
shape are automatically picked up by the next CCTP relay through either entry
point. No relay contract holds a module address.

## Considerations

- Each message can be processed once; handle already-processed cases gracefully.
- Both relay entry points are permissionless — anyone willing to pay gas can
  unstick funds and propagate auth/bundle execution.
- Bundle execution on the registry path is best-effort: a failed signature does
  not revert the auth snapshot or the mint. Mint failure does revert.
- Auth messages are anchored by the triple-check
  (`burnSender == hookData.safe == mintRecipient`), enforced inside the
  registry. `burnSender` is `BurnMessage.messageSender` — the source-chain
  burner — at full-message offset 248, **not** the outer header `sender` at
  offset 44 which holds Circle's `TokenMessengerV2`. See
  `packages/contracts/docs/CCTP_V2_MESSAGE_LAYOUT.md` for the canonical byte
  layout. The CreateX-constant `destinationCaller` removes a foot-gun where a
  caller could route an auth message to the wrong contract and strand the
  nonce.
- Reference: Circle's hook wrapper guidance (see `CCTPHookWrapper.sol`).
