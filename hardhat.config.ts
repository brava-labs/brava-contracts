import '@nomicfoundation/hardhat-ledger';
import '@nomicfoundation/hardhat-toolbox';
import '@nomiclabs/hardhat-solhint';
import * as tenderly from '@tenderly/hardhat-tenderly';
import 'dotenv/config';
import { HardhatUserConfig } from 'hardhat/config';
import { task } from 'hardhat/config';
import { exec } from 'child_process';
import { promisify } from 'util';

tenderly.setup({
  automaticVerifications: !!process.env.TENDERLY_AUTOMATIC_VERIFICATION,
});

const execAsync = promisify(exec);

task('analyze', 'Analyze all contracts with Mythril').setAction(async (_, hre) => {
  const contractNames = await hre.artifacts.getAllFullyQualifiedNames();

  for (const contractName of contractNames) {
    if (!contractName.endsWith('.sol')) continue;

    console.log(`\nAnalyzing ${contractName}...`);

    try {
      // Flatten
      const flattenedPath = `flattened/${contractName.split(':')[1]}`;
      await hre.run('flatten', {
        files: [contractName],
        output: flattenedPath,
      });

      // Analyze
      const { stdout, stderr } = await execAsync(`myth analyze ${flattenedPath} --solv 0.8.24`);

      console.log(stdout);
      if (stderr) console.error(stderr);
    } catch (error) {
      console.error(`Error analyzing ${contractName}:`, error);
    }
  }
});

const config: HardhatUserConfig = {
  solidity: '0.8.24',
  paths: {
    tests: './tests/',
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
};

export default config;
