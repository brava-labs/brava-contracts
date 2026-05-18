import { HardhatUserConfig } from 'hardhat/config';

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: '0.8.28',
        settings: {
          optimizer: { enabled: true, runs: 1000000 },
          evmVersion: 'paris',
        },
      },
    ],
    overrides: {
      'contracts/auth/AdminVault.sol': {
        version: '0.8.28',
        settings: {
          optimizer: { enabled: true, runs: 1 },
          viaIR: true,
          metadata: { bytecodeHash: 'none' },
        },
      },
    },
  },
};

export default config;
