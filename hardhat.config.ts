import '@nomicfoundation/hardhat-ledger';
import '@nomicfoundation/hardhat-toolbox';
import '@nomiclabs/hardhat-solhint';
import '@openzeppelin/hardhat-upgrades';
// import '@tenderly/hardhat-tenderly';
import 'dotenv/config';
import { HardhatUserConfig } from 'hardhat/config';

// Prefer explicit FORK_URL; otherwise fall back to NEXT_PUBLIC_RPC_URL for mainnet forking
const forkUrl = (process.env.FORK_URL && process.env.FORK_URL.trim()) || (process.env.NEXT_PUBLIC_RPC_URL && process.env.NEXT_PUBLIC_RPC_URL.trim()) || undefined;
const forkNetwork = process.env.FORK_NETWORK?.trim();
const forkBlockEnv = process.env.FORK_BLOCK ? Number(process.env.FORK_BLOCK) : undefined;
// Default to the repo's documented stable block when not provided (mainnet only)
const defaultForkBlock = 23096055;
const forkBlock = forkUrl
  ? forkNetwork === undefined || forkNetwork === '' || forkNetwork === 'mainnet'
    ? (forkBlockEnv ?? defaultForkBlock)
    : forkBlockEnv // for non-mainnet forks, only use an explicit FORK_BLOCK
  : undefined;

const config: HardhatUserConfig = {
  solidity: '0.8.28',
  paths: {
    tests: './test',
  },
  networks: {
    virtualMainnet: {
      url: process.env.TENDERLY_VIRTUAL_MAINNET_RPC!,
      chainId: 1,
    },
    hardhat: {
      forking: forkUrl
        ? {
            url: forkUrl,
            blockNumber: forkBlock,
          }
        : undefined,
      chains: {
        8453: {
          hardforkHistory: {
            london: 0,
            shanghai: 0,
            cancun: 0,
          },
        },
        42161: {
          hardforkHistory: {
            london: 0,
            shanghai: 0,
            cancun: 0,
          },
        },
      },
    },
    localhost: {
      url: 'http://127.0.0.1:8545',
    },
    mainnet: {
      url: process.env.MAINNET_RPC_URL || 'https://eth.llamarpc.com',
      chainId: 1,
      ledgerAccounts: [process.env.LEDGER_ACCOUNT!],
    },
    arbitrum: {
      url: process.env.ARBITRUM_RPC_URL!,
      chainId: 42161,
    },
    base: {
      url: process.env.BASE_RPC_URL!,
      chainId: 8453,
    },
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY!,
  },
};

export default config;
