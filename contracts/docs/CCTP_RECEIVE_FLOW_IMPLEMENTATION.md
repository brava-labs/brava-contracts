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
- Hook data is embedded in the CCTP message. Circle does not call the hook
  receiver. Your app must decode and execute the hook separately.
- Contract addresses (CCTP v2) are chain-constant:
  - `MessageTransmitter`: `0x81D40F21F12A8F0E3252Bccb954D722d4c464B64`
  - `TokenMessenger`: `0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d`
  - `TokenMinter`: `0xfd78EE919681417d192449715b2594ab58f5D002`

## Brava Integration

- Source chain uses `CCTPBridgeSend` to call `depositForBurnWithHook`.
- Set `destinationCaller` to the deployed `CCTPBundleReceiver` on the
  destination chain. This address will submit `receiveMessage`.
- Off-chain infra fetches attestation and calls
  `CCTPBundleReceiver.relayReceive(message, attestation)` to mint USDC.
- To execute the bundle, call `CCTPBundleReceiver.executeHook(hookData)` with
  the original hook payload:
  `abi.encode(IEip712TypedDataSafeModule.executeBundle.selector, safe, bundle, signature)`.
  Execution is permissionless and non-atomic with mint.

## Considerations

- Each message can be processed once; handle already-processed cases gracefully.
- `relayReceive` is permissionless to allow anyone to unstick funds. Hook
  execution is best-effort and may be invoked separately.
- Optionally verify that the hook’s `safe` equals the `mintRecipient` in your
  own infrastructure before calling `executeHook`.
- Reference: Circle’s hook wrapper guidance
  (see `CCTPHookWrapper.sol`).
