import '@nomicfoundation/hardhat-ledger';
import '@nomicfoundation/hardhat-toolbox';
import '@nomiclabs/hardhat-solhint';
import '@openzeppelin/hardhat-upgrades';
import '@tenderly/hardhat-tenderly';
import 'dotenv/config';
import { HardhatUserConfig } from 'hardhat/config';

const config: HardhatUserConfig = {
  solidity: '0.8.28',
  paths: {
    tests: './tests',
  },
  networks: {
    virtualMainnet: {
      url: process.env.TENDERLY_VIRTUAL_MAINNET_RPC!,
      chainId: 2131213115,
      accounts: [process.env.TENDERLY_PRIVATE_KEY!],
    },
    hardhat: {
      forking: {
        url: 'https://mainnet.gateway.tenderly.co/' + process.env.TENDERLY_API_KEY!,
        blockNumber: 21615102, // If this is updated, also update the quotes for Nexus Mutual in constants.ts. Or just use latest
        enabled: true,
      },
    },
    localhost: {
      url: 'http://127.0.0.1:8545',
    },
  },
  tenderly: {
    project: process.env.TENDERLY_PROJECT!,
    username: process.env.TENDERLY_USERNAME!,
  },
};

export default config;
