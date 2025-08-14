# Brava Smart Contracts 🏛️

Welcome to the Brava smart contract repository! 🚀 This project houses the smart contracts powering the Brava system. We're currently in an exciting early stage of development.

## 🛠️ Setup

1. Clone the repository

   ```
   git clone https://github.com/brava-labs/brava-smart-contracts.git
   ```

2. Install dependencies:

   ```
   npm install
   ```

3. Create a `.env` file in the root directory. Tests fork mainnet using `NEXT_PUBLIC_RPC_URL`. Use a provider with historical state at or before block `23096055` (archive/backfilled).

   Minimal variables:
   ```
   # Used by tests for mainnet forking
   NEXT_PUBLIC_RPC_URL=https://your.archive.mainnet.rpc
   ```
   Optional variables (used only by specific tests or tooling):
   ```
   ZERO_EX_API_KEY=your_zero_ex_api_key
   ETHERSCAN_API_KEY=your_etherscan_api_key
   ENABLE_LOGGING=false
   # Tenderly variables may be used by some scripts but are not required for tests
   TENDERLY_API_KEY=your_tenderly_api_key
   TENDERLY_VIRTUAL_MAINNET_RPC=https://virtual.mainnet.rpc.if.used
   TENDERLY_PROJECT=your_tenderly_project
   TENDERLY_USERNAME=your_tenderly_username
   LEDGER_ACCOUNT=your_ledger_eth_address
   ```

4. 🔗 Visit the [brava-ts-client repository](https://github.com/brava-labs/brava-ts-client.git) and follow the installation instructions.

## 🧪 Running Tests

Run tests using npm:

```
npm run test
```

For verbose logging:

```
npm run test:logging
```

To run specific action tests, append `-- --grep` and the name of the action:

```
npm run test -- --grep Curve
```

## 🚀 Development

This project uses Hardhat for Ethereum development. The main configuration can be found in `hardhat.config.ts`.

Notes:
- The local Hardhat network forks mainnet at block `23096055`. Configure `NEXT_PUBLIC_RPC_URL` to a mainnet RPC with historical state at that block.
- Most tests do not require optional credentials. Some integration tests (e.g., ZeroEx) will use the corresponding keys if provided.

### EIP-712 Typed Data Execution

The primary execution path is off-chain signing of a typed-data Bundle by a Safe owner. The signed Bundle is submitted to the `EIP712TypedDataSafeModule`, which validates and executes the sequence on the Safe via the `SequenceExecutor`.

Example typed data (Domain + Types + Value):

```json
{
  "domain": {
    "name": "BravaSafeModule",
    "version": "1.0.0",
    "chainId": 1,
    "verifyingContract": "0xUserSafeAddress",
    "salt": "0x" // keccak256("BravaSafe")
  },
  "primaryType": "Bundle",
  "types": {
    "Bundle": [
      { "name": "expiry", "type": "uint256" },
      { "name": "sequences", "type": "ChainSequence[]" }
    ],
    "ChainSequence": [
      { "name": "chainId", "type": "uint256" },
      { "name": "sequenceNonce", "type": "uint256" },
      { "name": "deploySafe", "type": "bool" },
      { "name": "enableGasRefund", "type": "bool" },
      { "name": "refundToken", "type": "address" },
      { "name": "maxRefundAmount", "type": "uint256" },
      { "name": "refundRecipient", "type": "uint8" },
      { "name": "sequence", "type": "Sequence" }
    ],
    "Sequence": [
      { "name": "name", "type": "string" },
      { "name": "actions", "type": "ActionDefinition[]" },
      { "name": "actionIds", "type": "bytes4[]" },
      { "name": "callData", "type": "bytes[]" }
    ],
    "ActionDefinition": [
      { "name": "protocolName", "type": "string" },
      { "name": "actionType", "type": "uint8" }
    ]
  },
  "message": {
    "expiry": 1735690000,
    "sequences": [
      {
        "chainId": 1,
        "sequenceNonce": 0,
        "deploySafe": false,
        "enableGasRefund": false,
        "refundToken": "0x0000000000000000000000000000000000000000",
        "maxRefundAmount": 0,
        "refundRecipient": 0,
        "sequence": {
          "name": "SampleSequence",
          "actions": [
            { "protocolName": "FluidV1", "actionType": 0 },
            { "protocolName": "SendToken", "actionType": 0 }
          ],
          "actionIds": [
            "0x1a2b3c4d",
            "0x5e6f7a8b"
          ],
          "callData": [
            "0x...", // ABI-encoded action params for first action
            "0x..."  // ABI-encoded action params for second action
          ]
        }
      }
    ]
  }
}
```

What each field means, at a glance:
- **domain.name/version**: Human-readable domain for signatures.
- **domain.chainId**: Fixed to 1 for cross-chain signature reuse.
- **domain.verifyingContract**: The `Safe` address.
- **domain.salt**: Domain salt; contracts fix this to `keccak256("BravaSafe")`.
- **Bundle.expiry**: Unix timestamp after which the Bundle is invalid.
- **ChainSequence.chainId**: Target chain for this sequence.
- **ChainSequence.sequenceNonce**: Prevents replay; must match the Safe’s next expected nonce.
- **ChainSequence.deploySafe**: If true, the module will deploy the Safe before executing.
- **ChainSequence.enableGasRefund**: Enables optional on-chain gas refund via a refund action.
- **ChainSequence.refundToken/maxRefundAmount/refundRecipient**: Parameters for the refund action.
- **Sequence.name**: Free-form label for the sequence.
- **Sequence.actions**: Array of action descriptors used for analytics/UX.
- **Sequence.actionIds**: Bytes4 identifiers (AdminVault mapping) for each action.
- **Sequence.callData**: ABI-encoded params for each action.

Execution flow:
- User signs the Bundle off-chain (EIP-712) as a Safe owner.
- A relayer (or the dApp) submits `executeBundle(safeAddr, bundle, signature)` to the `EIP712TypedDataSafeModule`.
- The module verifies the domain, expiry, signer ownership, and sequence nonce.
- If `deploySafe` is true, the module uses `SafeDeployment` to deploy the user’s Safe deterministically.
- The module calls `SequenceExecutor.executeSequence(...)` from the Safe via delegatecall to run each action.
- If enabled, the Gas Refund action reimburses gas to the executor or fee recipient.

#### SafeDeployment and deterministic Safe addresses
- `SafeDeployment` and related contracts support deterministic deployment (Create2-based proxies) so users can have the same Safe address across chains and be deployed on-demand.
- See `contracts/auth/SafeDeployment.sol` and `contracts/auth/SafeSetupRegistry.sol` for details.

🔗 This project relies on the brava-ts-client.

## 📜 Contract Overview

Our smart contract architecture is built on the Safe (formerly Gnosis Safe) smart account system, providing a secure and flexible foundation for complex DeFi operations. 🛡️

### Structure

- **Sequence Executor** 🔄: The central component that enables the execution of complex, multi-step DeFi operations in a single transaction.

- **Actions** 📁: The `actions` folder contains subfolders for each supported protocol. Within these subfolders, individual contracts represent specific protocol functions (e.g., Deposit, Withdraw, Swap).

- **AdminVault** 🔐: A central registry contract that keeps track of all action contracts and controls which actions are available, allowing for easy updates and management of the system.

- **Logger** 📝: A dedicated logger contract responsible for emitting all events, providing a centralized and consistent approach to event handling.

### Execution Model 🔄

Sequences of actions are executed through the Sequence Executor, which uses `delegatecall`s to run actions from an individual user's Safe smart wallet. This architecture allows for:

1. **Composability** 🧩: Multiple actions can be combined within a single transaction.
2. **Flexibility** 🤸: Complex DeFi operations can be constructed by sequencing simpler actions in any order.
3. **Gas Efficiency** ⛽: By executing multiple operations in one transaction, gas costs are optimized.
4. **User Fund Custody** 💼: All operations are executed in the context of the user's Safe wallet, maintaining custody of funds.

### Key Features 🌟

- **Modularity** 🧱: Each action is encapsulated in its own contract, promoting code reusability and easier maintenance.
- **Upgradability** 🔄: The AdminVault allows for seamless updates to individual action contracts without affecting the overall system.
- **Extensibility** 🔌: New protocols and actions can be easily added by deploying new contracts and registering them with the AdminVault.
- **Security** 🛡️: Action types provide fine-grained control over operations, enhancing system security.
- **Transparency** 🔍: Centralized logging and action type system improve error reporting and traceability.

This architecture enables users to perform sophisticated DeFi strategies efficiently and securely, all within the context of their Safe smart wallet, without Brava taking custody of funds. 🚀💼

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guidelines](CONTRIBUTING.md) 🚧UNDER CONSTRUCTION🚧 for more details.

## 📄 License

This project is licensed under the [MIT License](LICENSE).

## 📞 Contact

For any questions or concerns, please open an issue.

Happy coding! 🎉👩‍💻👨‍💻
