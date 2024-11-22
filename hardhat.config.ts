import '@nomicfoundation/hardhat-ledger';
import '@nomicfoundation/hardhat-toolbox';
import '@nomiclabs/hardhat-solhint';
import '@openzeppelin/hardhat-upgrades';
import '@tenderly/hardhat-tenderly';
import 'dotenv/config';
import { HardhatUserConfig } from 'hardhat/config';

interface HardhatUserConfigExtended extends HardhatUserConfig {
  upgrades?: {
    skipVerify: boolean;
  };
}

const config: HardhatUserConfigExtended = {
  solidity: '0.8.28',
  paths: {
    tests: './tests',
  },
  networks: {
    virtualMainnet: {
      url: process.env.TENDERLY_VIRTUAL_MAINNET_RPC!,
      chainId: 1,
    },
    hardhat: {
      forking: {
        url: 'https://mainnet.gateway.tenderly.co/' + process.env.TENDERLY_API_KEY!,
        blockNumber: 20978000, // If this is updated, also update the quotes for Nexus Mutual in constants.ts. Or just use latest
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
  upgrades: {
    skipVerify: true // Add this line to skip verification on Hardhat network
  }
};

export default config;
