import { Signer } from 'ethers';
import { ethers } from 'hardhat';
import { constants, stable, utils } from '../tests';
import { getBytes4 } from '../tests/utils';

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
    pullToken: await utils.deploy('PullToken', deployer, adminVaultAddress, loggerAddress),
    sendToken: await utils.deploy('SendToken', deployer, adminVaultAddress, loggerAddress)
  };

  for (const [name, contract] of Object.entries(contracts)) {
    console.log(`${name} deployed at: ${await contract.getAddress()}`);
  }

  console.log('Additional contracts deployed');

  console.log('Adding contracts to admin vault');
  const fluidSupplyAddress = await contracts.fluidSupply.getAddress();
  await baseSetup.adminVault.connect(deployer).proposeAction(getBytes4(fluidSupplyAddress), fluidSupplyAddress);
  await baseSetup.adminVault.connect(deployer).addAction(getBytes4(fluidSupplyAddress), fluidSupplyAddress);

  const fluidWithdrawAddress = await contracts.fluidWithdraw.getAddress();
  await baseSetup.adminVault.connect(deployer).proposeAction(getBytes4(fluidWithdrawAddress), fluidWithdrawAddress);
  await baseSetup.adminVault.connect(deployer).addAction(getBytes4(fluidWithdrawAddress), fluidWithdrawAddress);

  const curve3PoolSwapAddress = await contracts.curve3PoolSwap.getAddress();
  await baseSetup.adminVault.connect(deployer).proposeAction(getBytes4(curve3PoolSwapAddress), curve3PoolSwapAddress);
  await baseSetup.adminVault.connect(deployer).addAction(getBytes4(curve3PoolSwapAddress), curve3PoolSwapAddress);

  const buyCoverAddress = await contracts.buyCover.getAddress();
  await baseSetup.adminVault.connect(deployer).proposeAction(getBytes4(buyCoverAddress), buyCoverAddress);
  await baseSetup.adminVault.connect(deployer).addAction(getBytes4(buyCoverAddress), buyCoverAddress);

  const pullTokenAddress = await contracts.pullToken.getAddress();
  await baseSetup.adminVault.connect(deployer).proposeAction(getBytes4(pullTokenAddress), pullTokenAddress);
  await baseSetup.adminVault.connect(deployer).addAction(getBytes4(pullTokenAddress), pullTokenAddress);

  const sendTokenAddress = await contracts.sendToken.getAddress();
  await baseSetup.adminVault.connect(deployer).proposeAction(getBytes4(sendTokenAddress), sendTokenAddress);
  await baseSetup.adminVault.connect(deployer).addAction(getBytes4(sendTokenAddress), sendTokenAddress);

  console.log('Adding pools to admin vault');
  const FLUID_USDC_ADDRESS = constants.tokenConfig.fUSDC.address;
  await baseSetup.adminVault.connect(deployer).proposePool('Fluid', FLUID_USDC_ADDRESS);
  await baseSetup.adminVault.connect(deployer).addPool('Fluid', FLUID_USDC_ADDRESS);
  console.log(`FluidUSDC poolId: ${getBytes4(FLUID_USDC_ADDRESS)}`);

  const FLUID_USDT_ADDRESS = constants.tokenConfig.fUSDT.address;
  await baseSetup.adminVault.connect(deployer).proposePool('Fluid', FLUID_USDT_ADDRESS);
  await baseSetup.adminVault.connect(deployer).addPool('Fluid', FLUID_USDT_ADDRESS);

  // Fund test accounts with USDC
  const fundAmount = ethers.parseUnits('100000', constants.tokenConfig.USDC.decimals);
  for (const account of testAccounts) {
    await stable.fundAccountWithToken(await account.getAddress(), 'USDC', fundAmount);
    console.log(`Funded ${await account.getAddress()} with ${ethers.formatUnits(fundAmount, constants.tokenConfig.USDC.decimals)} USDC`);
  }

  // Fund test accounts with USDT
  const fundAmountUSDT = ethers.parseUnits('100000', constants.tokenConfig.USDT.decimals);
  for (const account of testAccounts) {
    await stable.fundAccountWithToken(await account.getAddress(), 'USDT', fundAmountUSDT);
    console.log(`Funded ${await account.getAddress()} with ${ethers.formatUnits(fundAmountUSDT, constants.tokenConfig.USDT.decimals)} USDT`);
  }

  console.log('Deployment and account setup completed');

  return { baseSetup, ...contracts };
}

async function main() {
  const [deployer, ...testAccounts] = await ethers.getSigners();
  await deployAndFundTestnet(deployer, testAccounts);
}

// main()
//   .then(() => process.exit(0))
//   .catch((error) => {
//     console.error(error);
//     process.exit(1);
//   });