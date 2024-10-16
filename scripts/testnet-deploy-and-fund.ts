import { Signer } from 'ethers';
import { ethers } from 'hardhat';
import { constants, stable, utils } from '../tests';

export async function deployAndFundTestnet(deployer: Signer, testAccounts: Signer[]) {
  console.log('Deploying contracts with the account:', await deployer.getAddress());

  // Deploy base setup
  const baseSetup = await utils.getBaseSetup(deployer);
  if (!baseSetup) {
    throw new Error('Base setup deployment failed');
  }
  console.log(`Admin Vault deployed at: ${await baseSetup.adminVault.getAddress()}`);
  console.log(`Logger deployed at: ${await baseSetup.logger.getAddress()}`);
  console.log(`Safe Proxy Factory deployed at: ${await baseSetup.safeProxyFactory.getAddress()}`);
  console.log('Base setup deployed');

  // Deploy additional contracts
  const adminVaultAddress = await baseSetup.adminVault.getAddress();
  const loggerAddress = await baseSetup.logger.getAddress();

  const contracts = {
    sequenceExecutor: await utils.deploy('SequenceExecutor', deployer, adminVaultAddress),
    fluidSupply: await utils.deploy('FluidSupply', deployer, adminVaultAddress, loggerAddress),
    fluidWithdraw: await utils.deploy('FluidWithdraw', deployer, adminVaultAddress, loggerAddress),
    curve3PoolSwap: await utils.deploy('Curve3PoolSwap', deployer, adminVaultAddress, loggerAddress, constants.CURVE_3POOL_ADDRESS),
    buyCover: await utils.deploy('BuyCover', deployer, adminVaultAddress, loggerAddress),
  };

  for (const [name, contract] of Object.entries(contracts)) {
    console.log(`${name} deployed at: ${await contract.getAddress()}`);
  }

  console.log('Additional contracts deployed');

  console.log('Adding contracts to admin vault');
  // TODO

  // Fund test accounts with USDC
  const fundAmount = ethers.parseUnits('100000', constants.tokenConfig.USDC.decimals);
  for (const account of testAccounts) {
    await stable.fundAccountWithToken(await account.getAddress(), 'USDC', fundAmount);
    console.log(`Funded ${await account.getAddress()} with ${ethers.formatUnits(fundAmount, constants.tokenConfig.USDC.decimals)} USDC`);
  }

  console.log('Deployment and account setup completed');

  return { baseSetup, ...contracts };
}

async function main() {
  const [deployer, ...testAccounts] = await ethers.getSigners();
  await deployAndFundTestnet(deployer, testAccounts);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });