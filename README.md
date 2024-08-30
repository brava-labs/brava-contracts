# AthenaFi Smart Contracts 🏛️

Welcome to the AthenaFi smart contract repository! 🚀 This project houses the smart contracts powering the AthenaFi system. We're currently in an exciting early stage of development.

## 🛠️ Setup

1. Clone the repository

   ```
   git clone https://github.com/your-repo/athenaFi-smart-contracts.git
   ```

2. Install dependencies:

   ```
   npm install
   ```

3. Create a `.env` file in the root directory and add your Alchemy API key:

   ```
   ALCHEMY_API_KEY=your_alchemy_api_key_here
   ```

4. 🔗 Visit the [athena-sdk repository](https://github.com/your-repo/athena-sdk) and follow the installation instructions.

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

🔗 This project relies on the athena-sdk.

## 📜 Contract Overview

Our smart contract architecture is built on the Safe (formerly Gnosis Safe) smart account system, providing a secure and flexible foundation for complex DeFi operations. 🛡️

### Structure

- **Actions** 📁: The `actions` folder contains subfolders for each supported protocol. Within these subfolders, individual contracts represent specific protocol functions (e.g., Deposit, Withdraw).

- **Contract Registry** 📚: A central registry contract keeps track of all action contracts, allowing for easy updates and management of the system.

- **Logger** 📝: A dedicated logger contract is responsible for emitting all events, providing a centralized and consistent approach to event handling.

### Execution Model 🔄

Actions are designed to be chained together through a sequence of `delegatecall`s from an individual user's Safe smart wallet. This architecture allows for:

1. **Composability** 🧩: Multiple actions can be combined within a single transaction.
2. **Flexibility** 🤸: Complex DeFi operations can be constructed by sequencing simpler actions.
3. **Gas Efficiency** ⛽: By executing multiple operations in one transaction, gas costs are optimized.

### Key Features 🌟

- **Modularity** 🧱: Each action is encapsulated in its own contract, promoting code reusability and easier maintenance.
- **Upgradability** 🔄: The contract registry allows for seamless updates to individual action contracts without affecting the overall system.
- **Extensibility** 🔌: New protocols and actions can be easily added by deploying new contracts and registering them.

This architecture enables users to perform sophisticated DeFi strategies efficiently and securely, all within the context of their Safe smart wallet. 🚀💼

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guidelines](CONTRIBUTING.md) 🚧UNDER CONSTRUCTION🚧 for more details.

## 📄 License

This project is licensed under the [MIT License](LICENSE).

## 📞 Contact

For any questions or concerns, please open an issue.

Happy coding! 🎉👩‍💻👨‍💻
