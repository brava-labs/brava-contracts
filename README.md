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

3. Create a `.env` file in the root directory. Use a mainnet RPC with historical blocks at or before block 23096055 (archive/backfilled). See `.env.sample` for all options.

   Minimal variables:
   ```
   # Option A (preferred for tests): Tenderly gateway for mainnet forking
   TENDERLY_API_KEY=your_tenderly_api_key

   # Option B: Your own Ethereum mainnet RPC (archive/backfilled)
   # Used for the `mainnet` network and general tooling
   MAINNET_RPC_URL=https://your.mainnet.rpc
   ```
   Optional variables (used only by specific tests or tasks):
   ```
   ZERO_EX_API_KEY=your_zero_ex_api_key
   ETHERSCAN_API_KEY=your_etherscan_api_key
   TENDERLY_VIRTUAL_MAINNET_RPC=https://virtual.mainnet.rpc.if.used
   TENDERLY_PROJECT=your_tenderly_project
   TENDERLY_USERNAME=your_tenderly_username
   LEDGER_ACCOUNT=your_ledger_eth_address
   ENABLE_LOGGING=false
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
- The local Hardhat network forks mainnet at block 23096055. By default, it uses the Tenderly gateway via `TENDERLY_API_KEY`. If you prefer a different provider, ensure it has historical state at that block.
- Most tests do not require optional credentials. Some integration tests (e.g., ZeroEx) will use the corresponding keys if provided.

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
