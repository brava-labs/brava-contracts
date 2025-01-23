import { Signer } from 'ethers';
import { ethers } from 'hardhat';
import { constants, utils } from '../tests';
import { SAFE_PROXY_FACTORY_ADDRESS } from '../tests/constants';
import { deploy } from '../tests/utils';
import { AdminVault, Logger, Proxy, SequenceExecutor } from '../typechain-types';

export async function deployBaseSetup(deployer: Signer) {
  console.log('Deploying contracts with the account:', await deployer.getAddress());

  // Deploy base setup
  const loggerImplementation = await deploy<Logger>('Logger', deployer);
  console.log('Logger Implementation deployed at:', await loggerImplementation.getAddress());

  const loggerProxy = await deploy<Proxy>(
    'contracts/auth/Proxy.sol:Proxy',
    deployer,
    await loggerImplementation.getAddress(),
    '0x'
  );
  console.log('Logger Proxy deployed at:', await loggerProxy.getAddress());

  const logger = await ethers.getContractAt('Logger', await loggerProxy.getAddress());

  const adminVault = await deploy<AdminVault>(
    'AdminVault',
    deployer,
    await deployer.getAddress(),
    0,
    await logger.getAddress()
  );
  console.log('Admin Vault deployed at:', await adminVault.getAddress());
  const proxy = await deploy<Proxy>(
    'contracts/auth/Proxy.sol:Proxy',
    deployer,
    SAFE_PROXY_FACTORY_ADDRESS,
    '0x'
  );
  console.log('Safe Proxy Factory deployed at:', await proxy.getAddress());

  const sequenceExecutor = await deploy<SequenceExecutor>(
    'SequenceExecutor',
    deployer,
    await adminVault.getAddress()
  );
  console.log('Sequence Executor deployed at:', await sequenceExecutor.getAddress());

  const adminVaultAddress = await adminVault.getAddress();
  const loggerAddress = await logger.getAddress();
  const sequenceExecutorAddress = await sequenceExecutor.getAddress();

  const contracts = {
    // Base contracts
    curve3PoolSwap: await utils.deploy('Curve3PoolSwap', deployer, adminVaultAddress, loggerAddress, constants.CURVE_3POOL_ADDRESS),
    buyCover: await utils.deploy('BuyCover', deployer, adminVaultAddress, loggerAddress),
    pullToken: await utils.deploy('PullToken', deployer, adminVaultAddress, loggerAddress),
    sendToken: await utils.deploy('SendToken', deployer, adminVaultAddress, loggerAddress),
    bravaGuard: await utils.deploy('BravaGuard', deployer, sequenceExecutorAddress),
    feeTakeSafeModule: await utils.deploy('FeeTakeSafeModule', deployer, adminVaultAddress, sequenceExecutorAddress),
    safeSetup: await utils.deploy('SafeSetup', deployer),
  };

  for (const [name, contract] of Object.entries(contracts)) {
    console.log(`${name} deployed at: ${await contract.getAddress()}`);
  }

  console.log('Deployment completed');
}

async function main() {
  const [deployer] = await ethers.getSigners();
  await deployBaseSetup(deployer);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });