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
- Brava uses a single `hookData` envelope:
  - **Bundle envelope** — `[20-byte target][raw calldata]`. Used by
    `CCTPBundleReceiver`. The target is informational only — the receiver discovers
    the destination Safe's Brava module via ERC-165 (see "Module Discovery" below).
  - CCTP messages carry **no** auth data: a relay only mints USDC and best-effort
    executes a separately-signed bundle. Auth config is never propagated over CCTP.
- Contract addresses (CCTP v2) are chain-constant:
  - `MessageTransmitter`: `0x81D40F21F12A8F0E3252Bccb954D722d4c464B64`
  - `TokenMessenger`: `0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d`
  - `TokenMinter`: `0xfd78EE919681417d192449715b2594ab58f5D002`

## Brava Integration

There is a single destination entry point, `CCTPBundleReceiver`:

- Source: `CCTPBridgeSend`. Caller supplies
  `destinationCaller = address(CCTPBundleReceiver)`.
- Destination: anyone calls `CCTPBundleReceiver.relay(message, attestation)`
  (mint only) or `CCTPBundleReceiver.relayWithBundle(message, attestation, safe,
  bundle, signature)` (mint + best-effort `executeBundle` against the Brava
  module discovered via ERC-165 on the Safe).
- Permissionless. Bundle execution is best-effort and decoupled from the mint
  outcome only when the bundle is supplied separately.
- CCTP carries no auth data. Auth config changes are applied per-chain through
  `AuthRegistry` directly (signed `AuthBundle`), never propagated over the bridge.
- Both entry points emit the `CCTP_BUNDLE_RECEIVE` Logger event (`LogType` 15) on
  every successful mint — `relay()` and an empty-bundle `relayWithBundle()`
  included — so the destination mint leg is always observable to the indexer, not
  only when a bundle runs. The event carries `(safe, amount, bundleSuccess, nonce,
  sourceDomain)`; `bundleSuccess` is `true` when no bundle ran, else the bundle's
  best-effort outcome. The `nonce` is the full CCTP `bytes32`.

### Module Discovery

`CCTPBundleReceiver` uses `BravaModuleLookup.findEnabledBravaModule(ISafe)`:

- Iterates the first page (capped at 10) of `getModulesPaginated`.
- Calls `supportsInterface(type(IBravaSafeModule).interfaceId)` on each, with
  `try/catch` around modules that are not ERC-165.
- Returns the unique match. Reverts on zero matches
  (`NoBravaModuleEnabled`) or more than one match (`MultipleBravaModules`).

`EIP712TypedDataSafeModule` inherits OpenZeppelin's `ERC165` and registers the
`IBravaSafeModule` marker — so module upgrades that keep the `executeBundle`
shape are automatically picked up by the next CCTP relay. The relay contract
holds no module address.

## Considerations

- Each message can be processed once; handle already-processed cases gracefully.
- The relay entry point is permissionless — anyone willing to pay gas can unstick
  funds and trigger bundle execution.
- Bundle execution is best-effort: a failed signature does not revert the mint.
  Mint failure does revert.
- See `packages/contracts/docs/CCTP_V2_MESSAGE_LAYOUT.md` for the canonical byte
  layout (`burnSender` is `BurnMessage.messageSender` at full-message offset 248,
  **not** the outer header `sender` at offset 44 which holds Circle's
  `TokenMessengerV2`).
- Reference: Circle's hook wrapper guidance (see `CCTPHookWrapper.sol`).
