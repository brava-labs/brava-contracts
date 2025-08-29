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

## Destination Receive

- Use `MessageTransmitter.receiveMessage(bytes message, bytes attestation)` on
  destination chain.
- Contract addresses (CCTP v2) are chain-constant:
  - `MessageTransmitter`: `0x81D40F21F12A8F0E3252Bccb954D722d4c464B64`
  - `TokenMessenger`: `0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d`
  - `TokenMinter`: `0xfd78EE919681417d192449715b2594ab58f5D002`
- Only `destinationCaller` can call `receiveMessage` for the given message.

## Brava Integration

- Build a source bundle with `PullToken` + `CCTP Bridge` actions.
- Off-chain infra fetches attestation and forwards `{message, attestation}` to
  destination chain.
- Destination chain should provide a `CCTPReceive` action that:
  - Accepts `(bytes message, bytes attestation)`
  - Calls `MessageTransmitter.receiveMessage`
  - Optionally forwards minted USDC according to workflow needs

## Considerations

- Each message can be processed once; handle already-processed cases gracefully.
- Expect ~270k gas on destination; budget accordingly.
- `destinationCaller` must be set to the on-chain address that performs
  `receiveMessage` (e.g., an action or orchestrator).
